import { Injectable } from '@angular/core';
import { StockApi } from '../stock-api/stock.api';
import { firstValueFrom } from 'rxjs';

type TfModule = typeof import('@tensorflow/tfjs');

interface DailyPoint {
	x: number;
	close: number;
}

export interface ForecastPoint {
	x: number;
	y: number;
}

export interface ForecastResult {
	history: DailyPoint[];
	forecast: ForecastPoint[];
}

@Injectable({
	providedIn: 'root',
})
export class AiForecastService {
	private backendReady = false;
	private tfModule: TfModule | null = null;

	constructor(private stockApi: StockApi) {}

	async generateForecast(
		primarySymbol: string,
		relatedSymbols: string[],
		horizon = 20,
		lookback = 20,
	): Promise<ForecastResult> {
		const tf = await this.getTfModule();
		await this.ensureBackend(tf);

		const symbols = [primarySymbol, ...relatedSymbols];
		const historiesBySymbol = await this.loadHistories(symbols);
		const history = historiesBySymbol.get(primarySymbol);

		if (!history) {
			throw new Error(`Primary symbol ${primarySymbol} did not return daily data`);
		}

		const histories = [history, ...relatedSymbols.map((symbol) => historiesBySymbol.get(symbol)).filter(Boolean)] as DailyPoint[][];
		const aligned = this.alignByDate(histories);

		if (aligned.timestamps.length < lookback + 30) {
			throw new Error('Too few aligned data points for training');
		}

		const returnsBySymbol = aligned.pricesBySymbol.map((prices) => this.toReturns(prices));
		const timestamps = aligned.timestamps.slice(1);
		const samples = this.buildSamples(returnsBySymbol, lookback);

		if (samples.inputs.length < 20) {
			throw new Error('Too few training samples after preprocessing');
		}

		const model = this.createModel(tf, samples.inputs[0].length);
		const xs = tf.tensor2d(samples.inputs);
		const ys = tf.tensor2d(samples.targets, [samples.targets.length, 1]);

		await model.fit(xs, ys, {
			epochs: 40,
			batchSize: 16,
			shuffle: true,
			verbose: 0,
		});

		xs.dispose();
		ys.dispose();

		const forecast = this.predictFuture(
			tf,
			model,
			returnsBySymbol,
			lookback,
			horizon,
			history[history.length - 1].close,
			timestamps[timestamps.length - 1],
		);

		model.dispose();

		return {
			history,
			forecast,
		};
	}

	private async loadHistories(symbols: string[]): Promise<Map<string, DailyPoint[]>> {
		const histories = new Map<string, DailyPoint[]>();
		const API_RATE_DELAY_MS = 13_000; // Alpha Vantage free: ~5 req/min
		let lastApiCallTime = 0;

		for (const symbol of symbols) {
			const needsApiCall = !this.stockApi.hasCached(symbol, 'TIME_SERIES_DAILY');

			if (needsApiCall && lastApiCallTime > 0) {
				const elapsed = Date.now() - lastApiCallTime;
				const wait = API_RATE_DELAY_MS - elapsed;
				if (wait > 0) {
					console.log(`Rate-limit guard: waiting ${Math.ceil(wait / 1000)}s before fetching ${symbol}`);
					await new Promise<void>((resolve) => setTimeout(resolve, wait));
				}
			}

			const response = await firstValueFrom(this.stockApi.getStock(symbol, 'TIME_SERIES_DAILY'));

			if (needsApiCall) {
				lastApiCallTime = Date.now();
			}

			const parsedSeries = this.parseSeries(response);

			if (!parsedSeries) {
				console.warn(`Skipping symbol ${symbol}: API returned no daily data`, response);
				continue;
			}

			histories.set(symbol, parsedSeries);
		}

		return histories;
	}

	private async getTfModule(): Promise<TfModule> {
		if (this.tfModule) {
			return this.tfModule;
		}

		const tf = await import('@tensorflow/tfjs');
		await import('@tensorflow/tfjs-backend-webgl');
		await import('@tensorflow/tfjs-backend-cpu');
		this.tfModule = tf;
		return tf;
	}

	private async ensureBackend(tf: TfModule): Promise<void> {
		if (this.backendReady) return;

		try {
			await tf.setBackend('webgl');
		} catch {
			await tf.setBackend('cpu');
		}

		await tf.ready();
		this.backendReady = true;
	}

	private parseSeries(response: any): DailyPoint[] | null {
		const dailyData = response?.['Time Series (Daily)'];
		if (!dailyData) {
			return null;
		}

		const series = Object.entries(dailyData)
			.map(([date, values]: [string, any]) => ({
				x: new Date(date).getTime(),
				close: Number.parseFloat(values['4. close']),
			}))
			.filter((point) => Number.isFinite(point.close))
			.sort((a, b) => a.x - b.x)
			.slice(-350);

		return series.length > 0 ? series : null;
	}

	private alignByDate(histories: DailyPoint[][]): { timestamps: number[]; pricesBySymbol: number[][] } {
		const dateSets = histories.map((series) => new Set(series.map((item) => item.x)));
		const commonTimestamps = histories[0]
			.map((item) => item.x)
			.filter((timestamp) => dateSets.every((dateSet) => dateSet.has(timestamp)));

		const sortedTimestamps = [...new Set(commonTimestamps)].sort((a, b) => a - b);
		const pricesBySymbol = histories.map((series) => {
			const map = new Map(series.map((item) => [item.x, item.close]));
			return sortedTimestamps.map((timestamp) => map.get(timestamp) ?? 0);
		});

		return {
			timestamps: sortedTimestamps,
			pricesBySymbol,
		};
	}

	private toReturns(prices: number[]): number[] {
		const returns: number[] = [];
		for (let i = 1; i < prices.length; i += 1) {
			const prev = prices[i - 1];
			const curr = prices[i];
			if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev <= 0) {
				returns.push(0);
				continue;
			}

			returns.push((curr - prev) / prev);
		}

		return returns;
	}

	private buildSamples(returnsBySymbol: number[][], lookback: number): { inputs: number[][]; targets: number[] } {
		const length = returnsBySymbol[0].length;
		const symbolCount = returnsBySymbol.length;
		const inputs: number[][] = [];
		const targets: number[] = [];

		for (let t = lookback; t < length - 1; t += 1) {
			const featureVector: number[] = [];
			for (let symbolIdx = 0; symbolIdx < symbolCount; symbolIdx += 1) {
				for (let i = t - lookback; i < t; i += 1) {
					featureVector.push(returnsBySymbol[symbolIdx][i]);
				}
			}

			inputs.push(featureVector);
			targets.push(returnsBySymbol[0][t]);
		}

		return { inputs, targets };
	}

	private createModel(tf: TfModule, inputSize: number): import('@tensorflow/tfjs').LayersModel {
		const model = tf.sequential();
		model.add(tf.layers.dense({ inputShape: [inputSize], units: 64, activation: 'relu' }));
		model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
		model.add(tf.layers.dense({ units: 1, activation: 'tanh' }));
		model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
		return model;
	}

	private predictFuture(
		tf: TfModule,
		model: import('@tensorflow/tfjs').LayersModel,
		returnsBySymbol: number[][],
		lookback: number,
		horizon: number,
		lastPrice: number,
		lastKnownTimestamp: number,
	): ForecastPoint[] {
		const symbolStates = returnsBySymbol.map((series) => series.slice(-lookback));
		const forecast: ForecastPoint[] = [];
		let rollingPrice = lastPrice;
		let timestamp = lastKnownTimestamp;
		const dayMs = 24 * 60 * 60 * 1000;

		for (let step = 0; step < horizon; step += 1) {
			const input = symbolStates.flat();
			const inputTensor = tf.tensor2d([input]);
			const outputTensor = model.predict(inputTensor) as import('@tensorflow/tfjs').Tensor;
			const predictedReturnRaw = outputTensor.dataSync()[0];
			const predictedReturn = Math.max(-0.2, Math.min(0.2, predictedReturnRaw));

			inputTensor.dispose();
			outputTensor.dispose();

			symbolStates[0].shift();
			symbolStates[0].push(predictedReturn);

			for (let i = 1; i < symbolStates.length; i += 1) {
				symbolStates[i].shift();
				symbolStates[i].push(0);
			}

			rollingPrice *= 1 + predictedReturn;
			timestamp += dayMs;
			forecast.push({ x: timestamp, y: rollingPrice });
		}

		return forecast;
	}
}
