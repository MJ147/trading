import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { StockApi } from './services/stock-api/stock.api';
import { MatButtonModule } from '@angular/material/button';
import { Chart, registerables } from 'chart.js';
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial';
import 'chartjs-adapter-date-fns';

interface CandlestickData {
	x: Date;
	o: number;
	h: number;
	l: number;
	c: number;
}

@Component({
	selector: 'app-root',
	standalone: true,
	imports: [RouterOutlet, MatButtonModule],
	templateUrl: './app.component.html',
	styleUrl: './app.component.less',
})
export class AppComponent {
	title = 'trading';
	// chart: any = null;

	constructor(private stockApi: StockApi) {
		Chart.register(...registerables, CandlestickController, CandlestickElement);
	}

	ngOnInit(): void {
		this.stockApi.getStock('IBM', 'TIME_SERIES_DAILY').subscribe((data) => {
			const candleStickData = Object.entries(data['Time Series (Daily)']).map((entry: any) => ({
				x: new Date(entry[0]),
				o: entry[1]['1. open'],
				h: entry[1]['2. high'],
				l: entry[1]['3. low'],
				c: entry[1]['4. close'],
			}));

			// thisdata.datasets[0].data = candleStickData;
			// console.log(this.chart.data.datasets[0].data);
			console.log(new Date('2023-08-01'));
			this.createCandlestickChart(candleStickData);
		});
	}

	createCandlestickChart(candlestickData: any) {
		const ctx = document.getElementById('myChart') as HTMLCanvasElement;
		// console.log(candlestickData);

		// const candlestickData = [
		// 	{ x: new Date('2023-08-01'), o: 100, h: 110, l: 90, c: 105 },
		// 	{ x: new Date('2023-08-02'), o: 105, h: 115, l: 95, c: 100 },
		// 	{ x: new Date('2023-08-03'), o: 100, h: 108, l: 92, c: 95 },
		// 	// Add more data points as needed
		// ];

		new Chart(ctx, {
			type: 'candlestick',
			data: {
				datasets: [
					{
						label: 'Candlestick Chart',
						data: candlestickData,
						barThickness: 5,
					},
				],
			},
			options: {
				scales: {
					x: {
						type: 'time',
						time: {
							unit: 'day',
						},
						// offset: true,
						// ticks: {
						// 	stepSize: 10,
						// 	padding: 20, // Adds padding between the ticks and the chart area
						// },

						// afterFit: (scale) => {
						//     const
						// 	scale.max = (new Date().setDate(new Date(scale.max).getTime() + 1))
						// },
					},
					y: {
						beginAtZero: false,
					},
				},
			},
		});
	}
}
