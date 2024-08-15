import { TestBed } from '@angular/core/testing';

import { StockApi } from './stock.api';

describe('StockApi', () => {
	let service: StockApi;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		service = TestBed.inject(StockApi);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
});
