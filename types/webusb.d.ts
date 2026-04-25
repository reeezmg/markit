declare interface USBEndpoint {
  direction: 'in' | 'out';
  endpointNumber: number;
}

declare interface USBAlternateInterface {
  alternateSetting: number;
  endpoints: USBEndpoint[];
}

declare interface USBInterface {
  interfaceNumber: number;
  alternates: USBAlternateInterface[];
}

declare interface USBConfiguration {
  configurationValue: number;
  interfaces: USBInterface[];
}

declare interface USBOutTransferResult {
  status: string;
}

declare interface USBDeviceFilter {
  vendorId?: number;
  productId?: number;
  classCode?: number;
  subclassCode?: number;
  protocolCode?: number;
  serialNumber?: string;
}

declare interface USBDeviceRequestOptions {
  filters: USBDeviceFilter[];
}

declare interface USBDevice {
  vendorId: number;
  productId: number;
  serialNumber?: string | null;
  manufacturerName?: string;
  productName?: string;
  opened: boolean;
  configuration?: USBConfiguration | null;
  configurations?: USBConfiguration[];
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  selectAlternateInterface(interfaceNumber: number, alternateSetting: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
}

declare interface USB {
  requestDevice(options: USBDeviceRequestOptions): Promise<USBDevice>;
  getDevices(): Promise<USBDevice[]>;
}

declare interface Navigator {
  usb: USB;
}
