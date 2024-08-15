import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of, tap } from 'rxjs';

@Injectable({
	providedIn: 'root',
})
export class StockApi {
	readonly BASE_URL = 'https://www.alphavantage.co/';
	readonly APIKEY;

	constructor(private http: HttpClient) {
		this.APIKEY = this.storageApikey;
	}

	getStock(stockSymbol: string, fn: string): Observable<any> {
		let params = new HttpParams().set('symbol', stockSymbol).set('function', fn);
		const cachedResponse = localStorage.getItem(`${stockSymbol}/${fn}`);
		params = params.set('apikey', this.APIKEY);

		if (cachedResponse) return of(JSON.parse(cachedResponse));

		return this.http.get(`${this.BASE_URL}query?${params}`).pipe(
			tap((response) => {
				if (!Object.hasOwn(response, 'Error Message')) return;

				localStorage.setItem(`${stockSymbol}/${fn}`, JSON.stringify(response));
			}),
		);
	}

	get storageApikey(): string {
		return localStorage.getItem('apikey') || '';
	}
}
