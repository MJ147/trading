import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Chart, registerables } from 'chart.js';
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial';
import 'chartjs-adapter-date-fns';
import { AiForecastService, ForecastPoint } from './services/ai-forecast/ai-forecast.service';

interface CandlestickData {
	x: number;
	o: number;
	h: number;
	l: number;
	c: number;
}

@Component({
	selector: 'app-root',
	standalone: true,
	imports: [MatButtonModule],
	templateUrl: './app.component.html',
	styleUrl: './app.component.less',
})
export class AppComponent {
	title = 'trading';
	private chart: Chart | null = null;
	isForecasting = false;

	constructor(private aiForecastService: AiForecastService) {
		Chart.register(...registerables, CandlestickController, CandlestickElement);
	}

	ngOnInit(): void {
		this.loadStock();
	}

	async loadStock(): Promise<void> {
		if (this.isForecasting) return;

		this.isForecasting = true;
		try {
			const result = await this.aiForecastService.generateForecast('IBM', ['AAPL', 'MSFT', 'GOOGL'], 20, 20);
			const candleStickData = this.toCandles(result.history);
			this.createCandlestickChart(candleStickData, result.forecast);
		} catch (error) {
			console.error('AI forecast generation failed', error);
		} finally {
			this.isForecasting = false;
		}
	}

	private toCandles(history: { x: number; close: number }[]): CandlestickData[] {
		return history.map((point, index) => {
			const prevClose = index > 0 ? history[index - 1].close : point.close;
			const open = prevClose;
			const close = point.close;

			return {
				x: point.x,
				o: open,
				h: Math.max(open, close),
				l: Math.min(open, close),
				c: close,
			};
		});
	}

	createCandlestickChart(candlestickData: CandlestickData[], forecastData: ForecastPoint[]) {
		const ctx = document.getElementById('myChart') as HTMLCanvasElement;
		if (!ctx) {
			console.error('Chart canvas not found');
			return;
		}

		this.chart?.destroy();
		this.chart = new Chart(ctx, {
			type: 'candlestick',
			data: {
				datasets: [
					{
						label: 'IBM History',
						data: candlestickData,
						barThickness: 5,
					},
					{
						type: 'line',
						label: 'AI Forecast',
						data: forecastData,
						borderColor: '#ff6b35',
						backgroundColor: 'rgba(255, 107, 53, 0.2)',
						borderWidth: 2,
						pointRadius: 0,
						tension: 0.2,
					},
				],
			},
			options: {
				plugins: {
					legend: {
						display: true,
					},
				},
				scales: {
					x: {
						type: 'time',
						time: {
							unit: 'day',
						},
					},
					y: {
						beginAtZero: false,
					},
				},
			},
		} as any);
	}
}
