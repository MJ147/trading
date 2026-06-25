import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of, tap } from 'rxjs';

@Injectable({
	providedIn: 'root',
})
export class StockApi {
	readonly BASE_URL = 'https://www.alphavantage.co/';
	readonly APIKEY =  '2WRWY84SLT66Y6VU';

	constructor(private http: HttpClient) {}

	getStock(stockSymbol: string, fn: string, forceRefresh = false): Observable<any> {
		const cacheKey = `${stockSymbol}/${fn}`;
		if (forceRefresh) {
			localStorage.removeItem(cacheKey);
		}

		const cachedResponse = localStorage.getItem(cacheKey);
		const params = new HttpParams()
			.set('symbol', stockSymbol)
			.set('function', fn)
			.set('apikey', this.APIKEY);

		if (cachedResponse) {
			try {
				const parsed = JSON.parse(cachedResponse);
				if (Object.hasOwn(parsed, 'Time Series (Daily)')) {
					return of(parsed);
				}

				localStorage.removeItem(cacheKey);
			} catch {
				localStorage.removeItem(cacheKey);
			}
		}

		return this.http.get(`${this.BASE_URL}query`, { params }).pipe(
			tap((response) => {
				if (
					Object.hasOwn(response, 'Error Message') ||
					Object.hasOwn(response, 'Note') ||
					!Object.hasOwn(response, 'Time Series (Daily)')
				) {
					return;
				}

				localStorage.setItem(cacheKey, JSON.stringify(response));
			}),
		);
	}

	hasCached(stockSymbol: string, fn: string): boolean {
		const cacheKey = `${stockSymbol}/${fn}`;
		try {
			const raw = localStorage.getItem(cacheKey);
			if (!raw) return false;
			const parsed = JSON.parse(raw);
			return Object.hasOwn(parsed, 'Time Series (Daily)');
		} catch {
			return false;
		}
	}

	get storageApikey(): string {
		return localStorage.getItem('apikey') || '';
	}
}
