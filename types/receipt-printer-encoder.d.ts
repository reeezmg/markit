declare module '@point-of-sale/receipt-printer-encoder' {
  export default class ReceiptPrinterEncoder {
    constructor(options?: any);
    initialize(): this;
    bold(value?: boolean): this;
    align(value: string): this;
    text(value: string): this;
    newline(count?: number): this;
    size(width: number, height: number): this;
    rule(options?: any): this;
    invert(value?: boolean): this;
    qrcode(value: string, options?: any): this;
    barcode(value: string, symbology: string, options?: any): this;
    cut(): this;
    encode(): Uint8Array;
  }
}
