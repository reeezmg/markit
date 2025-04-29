
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.CompanyScalarFieldEnum = {
  id: 'id',
  name: 'name',
  storecode: 'storecode',
  storeUniqueName: 'storeUniqueName',
  logo: 'logo',
  description: 'description',
  shopifyStoreName: 'shopifyStoreName',
  shopifyAccessToken: 'shopifyAccessToken',
  tiktokCipher: 'tiktokCipher',
  tiktokStoreName: 'tiktokStoreName',
  tiktokAccessToken: 'tiktokAccessToken',
  tiktokAccessTokenExpireIn: 'tiktokAccessTokenExpireIn',
  tiktokRefreshToken: 'tiktokRefreshToken',
  tiktokRefreshTokenExpireIn: 'tiktokRefreshTokenExpireIn',
  images: 'images',
  isTaxIncluded: 'isTaxIncluded',
  status: 'status',
  type: 'type',
  accHolderName: 'accHolderName',
  ifsc: 'ifsc',
  accountNo: 'accountNo',
  bankName: 'bankName',
  gstin: 'gstin',
  upiId: 'upiId',
  billCounter: 'billCounter',
  barcodeCounter: 'barcodeCounter'
};

exports.Prisma.DistributorScalarFieldEnum = {
  id: 'id',
  name: 'name',
  images: 'images',
  status: 'status',
  accHolderName: 'accHolderName',
  ifsc: 'ifsc',
  accountNo: 'accountNo',
  bankName: 'bankName',
  gstin: 'gstin'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  name: 'name',
  password: 'password',
  status: 'status',
  role: 'role',
  image: 'image'
};

exports.Prisma.ClientScalarFieldEnum = {
  id: 'id',
  email: 'email',
  name: 'name',
  password: 'password',
  phone: 'phone',
  status: 'status',
  pipelineStatus: 'pipelineStatus',
  newPipelineId: 'newPipelineId',
  prospectPipelineId: 'prospectPipelineId',
  viewingPipelineId: 'viewingPipelineId',
  rejectPipelineId: 'rejectPipelineId',
  closePipelineId: 'closePipelineId'
};

exports.Prisma.PipelineScalarFieldEnum = {
  id: 'id',
  companyId: 'companyId'
};

exports.Prisma.CategoryScalarFieldEnum = {
  id: 'id',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  name: 'name',
  description: 'description',
  status: 'status',
  image: 'image',
  companyId: 'companyId',
  hsn: 'hsn',
  taxType: 'taxType',
  fixedTax: 'fixedTax',
  thresholdAmount: 'thresholdAmount',
  taxBelowThreshold: 'taxBelowThreshold',
  taxAboveThreshold: 'taxAboveThreshold'
};

exports.Prisma.SubcategoryScalarFieldEnum = {
  id: 'id',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  name: 'name',
  description: 'description',
  status: 'status',
  image: 'image',
  companyId: 'companyId',
  categoryId: 'categoryId'
};

exports.Prisma.ProductScalarFieldEnum = {
  id: 'id',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  name: 'name',
  brand: 'brand',
  status: 'status',
  rating: 'rating',
  description: 'description',
  companyId: 'companyId',
  categoryId: 'categoryId',
  subcategoryId: 'subcategoryId',
  purchaseorderId: 'purchaseorderId'
};

exports.Prisma.VariantScalarFieldEnum = {
  id: 'id',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  name: 'name',
  code: 'code',
  status: 'status',
  sprice: 'sprice',
  pprice: 'pprice',
  qty: 'qty',
  discount: 'discount',
  dprice: 'dprice',
  sizes: 'sizes',
  images: 'images',
  tax: 'tax',
  productId: 'productId',
  companyId: 'companyId'
};

exports.Prisma.ItemScalarFieldEnum = {
  id: 'id',
  barcode: 'barcode',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  variantId: 'variantId',
  status: 'status',
  size: 'size',
  companyId: 'companyId'
};

exports.Prisma.PurchaseOrderScalarFieldEnum = {
  id: 'id',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  distributorId: 'distributorId',
  paymentType: 'paymentType',
  companyId: 'companyId'
};

exports.Prisma.BillScalarFieldEnum = {
  id: 'id',
  createdAt: 'createdAt',
  invoiceNumber: 'invoiceNumber',
  subtotal: 'subtotal',
  discount: 'discount',
  tax: 'tax',
  grandTotal: 'grandTotal',
  deliveryFees: 'deliveryFees',
  paymentMethod: 'paymentMethod',
  paymentStatus: 'paymentStatus',
  transactionId: 'transactionId',
  notes: 'notes',
  type: 'type',
  status: 'status',
  deleted: 'deleted',
  bookingDate: 'bookingDate',
  returnDeadline: 'returnDeadline',
  companyId: 'companyId',
  accountId: 'accountId',
  clientId: 'clientId',
  addressId: 'addressId'
};

exports.Prisma.TokenEntryScalarFieldEnum = {
  id: 'id',
  createdAt: 'createdAt',
  tokenNo: 'tokenNo',
  companyId: 'companyId',
  itemId: 'itemId',
  variantId: 'variantId',
  barcode: 'barcode',
  categoryId: 'categoryId',
  size: 'size',
  name: 'name',
  qty: 'qty',
  rate: 'rate',
  discount: 'discount',
  tax: 'tax',
  value: 'value',
  sizes: 'sizes',
  totalQty: 'totalQty'
};

exports.Prisma.EntryScalarFieldEnum = {
  id: 'id',
  name: 'name',
  barcode: 'barcode',
  qty: 'qty',
  rate: 'rate',
  discount: 'discount',
  tax: 'tax',
  value: 'value',
  size: 'size',
  variantId: 'variantId',
  outOfStock: 'outOfStock',
  categoryId: 'categoryId',
  billId: 'billId',
  itemId: 'itemId'
};

exports.Prisma.AccountScalarFieldEnum = {
  id: 'id',
  name: 'name',
  phone: 'phone',
  companyId: 'companyId'
};

exports.Prisma.ExpenseCategoryScalarFieldEnum = {
  id: 'id',
  name: 'name',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  companyId: 'companyId'
};

exports.Prisma.ExpenseScalarFieldEnum = {
  id: 'id',
  expenseDate: 'expenseDate',
  note: 'note',
  currency: 'currency',
  paymentMode: 'paymentMode',
  status: 'status',
  receipt: 'receipt',
  receiptName: 'receiptName',
  taxAmount: 'taxAmount',
  totalAmount: 'totalAmount',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  expensecategoryId: 'expensecategoryId',
  companyId: 'companyId'
};

exports.Prisma.PaymentScalarFieldEnum = {
  id: 'id',
  paymentDate: 'paymentDate',
  paymentMode: 'paymentMode',
  paymentReference: 'paymentReference',
  amount: 'amount',
  currency: 'currency',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  companyId: 'companyId'
};

exports.Prisma.AddressScalarFieldEnum = {
  id: 'id',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  name: 'name',
  street: 'street',
  locality: 'locality',
  city: 'city',
  state: 'state',
  pincode: 'pincode',
  active: 'active',
  userId: 'userId',
  clientId: 'clientId',
  distributorId: 'distributorId',
  companyId: 'companyId',
  accountId: 'accountId'
};

exports.Prisma.ConversationScalarFieldEnum = {
  id: 'id',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MessageScalarFieldEnum = {
  id: 'id',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  conversationId: 'conversationId',
  senderId: 'senderId',
  text: 'text',
  seen: 'seen',
  replyto: 'replyto',
  edited: 'edited',
  deleted: 'deleted'
};

exports.Prisma.CompanyUserScalarFieldEnum = {
  companyId: 'companyId',
  userId: 'userId'
};

exports.Prisma.CompanyClientScalarFieldEnum = {
  companyId: 'companyId',
  clientId: 'clientId'
};

exports.Prisma.UserConversationScalarFieldEnum = {
  userId: 'userId',
  conversationId: 'conversationId'
};

exports.Prisma.ClientConversationScalarFieldEnum = {
  clientId: 'clientId',
  conversationId: 'conversationId'
};

exports.Prisma.UserClientScalarFieldEnum = {
  clientId: 'clientId',
  userId: 'userId'
};

exports.Prisma.DistributorCompanyScalarFieldEnum = {
  distributorId: 'distributorId',
  companyId: 'companyId'
};

exports.Prisma.VariantSizeBarcodeScalarFieldEnum = {
  id: 'id',
  variantId: 'variantId',
  size: 'size',
  barcode: 'barcode'
};

exports.Prisma.EmailOtpScalarFieldEnum = {
  id: 'id',
  email: 'email',
  otp: 'otp',
  expiresAt: 'expiresAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  companyId: 'companyId',
  userId: 'userId',
  clientId: 'clientId',
  type: 'type',
  title: 'title',
  message: 'message',
  read: 'read',
  actionPath: 'actionPath',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.CompanyType = exports.$Enums.CompanyType = {
  seller: 'seller',
  buyer: 'buyer'
};

exports.UserRole = exports.$Enums.UserRole = {
  admin: 'admin',
  user: 'user'
};

exports.TaxType = exports.$Enums.TaxType = {
  FIXED: 'FIXED',
  VARIABLE: 'VARIABLE'
};

exports.paymentType = exports.$Enums.paymentType = {
  Credit: 'Credit',
  Cash: 'Cash'
};

exports.PaymentStatus = exports.$Enums.PaymentStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
};

exports.OrderType = exports.$Enums.OrderType = {
  STANDARD: 'STANDARD',
  BOOKING: 'BOOKING',
  TRY_AT_HOME: 'TRY_AT_HOME',
  BILL: 'BILL'
};

exports.OrderStatus = exports.$Enums.OrderStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  PACKED: 'PACKED',
  DELIVERED: 'DELIVERED',
  CANCELED: 'CANCELED',
  OUTOFSTOCK: 'OUTOFSTOCK',
  BOOKED: 'BOOKED'
};

exports.PaymentMode = exports.$Enums.PaymentMode = {
  CASH: 'CASH',
  CARD: 'CARD',
  BANK_TRANSFER: 'BANK_TRANSFER',
  UPI: 'UPI'
};

exports.NotificationType = exports.$Enums.NotificationType = {
  ORDER_RECEIVED: 'ORDER_RECEIVED',
  BILL_CREATED: 'BILL_CREATED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  EXPENSE_CREATED: 'EXPENSE_CREATED',
  INVENTORY_LOW: 'INVENTORY_LOW',
  SHIPMENT_SENT: 'SHIPMENT_SENT',
  SYSTEM_ALERT: 'SYSTEM_ALERT'
};

exports.Prisma.ModelName = {
  Company: 'Company',
  Distributor: 'Distributor',
  User: 'User',
  Client: 'Client',
  Pipeline: 'Pipeline',
  Category: 'Category',
  Subcategory: 'Subcategory',
  Product: 'Product',
  Variant: 'Variant',
  Item: 'Item',
  PurchaseOrder: 'PurchaseOrder',
  Bill: 'Bill',
  TokenEntry: 'TokenEntry',
  Entry: 'Entry',
  Account: 'Account',
  ExpenseCategory: 'ExpenseCategory',
  Expense: 'Expense',
  Payment: 'Payment',
  Address: 'Address',
  Conversation: 'Conversation',
  Message: 'Message',
  CompanyUser: 'CompanyUser',
  CompanyClient: 'CompanyClient',
  UserConversation: 'UserConversation',
  ClientConversation: 'ClientConversation',
  UserClient: 'UserClient',
  DistributorCompany: 'DistributorCompany',
  VariantSizeBarcode: 'VariantSizeBarcode',
  EmailOtp: 'EmailOtp',
  Notification: 'Notification'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
