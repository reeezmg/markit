"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const metadata = {
    models: {
        distributorCompany: {
            name: 'DistributorCompany', fields: {
                distributorId: {
                    name: "distributorId",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "distributor_id" }] }],
                    isForeignKey: true,
                    relationField: 'distributor',
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                }, distributor: {
                    name: "distributor",
                    type: "Distributor",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'companies',
                    isRelationOwner: true,
                    onDeleteAction: 'Cascade',
                    foreignKeyMapping: { "id": "distributorId" },
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'distributor',
                    isRelationOwner: true,
                    onDeleteAction: 'Cascade',
                    foreignKeyMapping: { "id": "companyId" },
                }, distributorPayments: {
                    name: "distributorPayments",
                    type: "DistributorPayment",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'distributorCompany',
                }, distributorCredits: {
                    name: "distributorCredits",
                    type: "DistributorCredit",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'distributorCompany',
                }, purchaseOrders: {
                    name: "purchaseOrders",
                    type: "PurchaseOrder",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'distributorCompany',
                },
            }, uniqueConstraints: {
                distributorId_companyId: {
                    name: "distributorId_companyId",
                    fields: ["distributorId", "companyId"]
                },
            },
            attributes: [{ "name": "@@id", "args": [] }, { "name": "@@allow", "args": [{ "value": "read,create, update, delete" }] }, { "name": "@@map", "args": [{ "value": "distributor_companies" }] }],
        },
        company: {
            name: 'Company', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, name: {
                    name: "name",
                    type: "String",
                }, storecode: {
                    name: "storecode",
                    type: "Int",
                    attributes: [{ "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                    isAutoIncrement: true,
                }, storeUniqueName: {
                    name: "storeUniqueName",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@unique", "args": [] }, { "name": "@map", "args": [{ "value": "store_unique_name" }] }],
                }, logo: {
                    name: "logo",
                    type: "String",
                    isOptional: true,
                }, description: {
                    name: "description",
                    type: "String",
                    isOptional: true,
                }, shopifyStoreName: {
                    name: "shopifyStoreName",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "shopify_store_name" }] }],
                }, shopifyAccessToken: {
                    name: "shopifyAccessToken",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "shopify_access_token" }] }],
                }, tiktokCipher: {
                    name: "tiktokCipher",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "tiktok_cipher" }] }],
                }, tiktokStoreName: {
                    name: "tiktokStoreName",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "tiktok_store_name" }] }],
                }, tiktokAccessToken: {
                    name: "tiktokAccessToken",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "tiktok_access_token" }] }],
                }, tiktokAccessTokenExpireIn: {
                    name: "tiktokAccessTokenExpireIn",
                    type: "Int",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "tiktok_access_token_expire_in" }] }],
                }, tiktokRefreshToken: {
                    name: "tiktokRefreshToken",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "tiktok_refresh_token" }] }],
                }, tiktokRefreshTokenExpireIn: {
                    name: "tiktokRefreshTokenExpireIn",
                    type: "Int",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "tiktok_refresh_token_expire_in" }] }],
                }, images: {
                    name: "images",
                    type: "String",
                    isOptional: true,
                }, isTaxIncluded: {
                    name: "isTaxIncluded",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }, { "name": "@map", "args": [{ "value": "is_tax_included" }] }],
                }, isBarcodeIncluded: {
                    name: "isBarcodeIncluded",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }, { "name": "@map", "args": [{ "value": "is_barcode_included" }] }],
                }, users: {
                    name: "users",
                    type: "CompanyUser",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, promoCodes: {
                    name: "promoCodes",
                    type: "PromoCode",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, clients: {
                    name: "clients",
                    type: "CompanyClient",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, products: {
                    name: "products",
                    type: "Product",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, categories: {
                    name: "categories",
                    type: "Category",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, subcategories: {
                    name: "subcategories",
                    type: "Subcategory",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, bills: {
                    name: "bills",
                    type: "Bill",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, carts: {
                    name: "carts",
                    type: "CartCompanyClient",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, tokenbills: {
                    name: "tokenbills",
                    type: "TokenEntry",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, accounts: {
                    name: "accounts",
                    type: "Account",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, expenseCategories: {
                    name: "expenseCategories",
                    type: "ExpenseCategory",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, expenses: {
                    name: "expenses",
                    type: "Expense",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, payment: {
                    name: "payment",
                    type: "Payment",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, variants: {
                    name: "variants",
                    type: "Variant",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, purchaseOrders: {
                    name: "purchaseOrders",
                    type: "PurchaseOrder",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, items: {
                    name: "items",
                    type: "Item",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, status: {
                    name: "status",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, type: {
                    name: "type",
                    type: "CompanyType",
                }, pipeline: {
                    name: "pipeline",
                    type: "Pipeline",
                    isDataModel: true,
                    isOptional: true,
                    backLink: 'company',
                }, accHolderName: {
                    name: "accHolderName",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "acc_holder_name" }] }],
                }, ifsc: {
                    name: "ifsc",
                    type: "String",
                    isOptional: true,
                }, accountNo: {
                    name: "accountNo",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "account_no" }] }],
                }, bankName: {
                    name: "bankName",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "bank_name" }] }],
                }, gstin: {
                    name: "gstin",
                    type: "String",
                    isOptional: true,
                }, upiId: {
                    name: "upiId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "upi_id" }] }],
                }, notifications: {
                    name: "notifications",
                    type: "Notification",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, address: {
                    name: "address",
                    type: "Address",
                    isDataModel: true,
                    isOptional: true,
                    backLink: 'company',
                }, distributor: {
                    name: "distributor",
                    type: "DistributorCompany",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, billCounter: {
                    name: "billCounter",
                    type: "Int",
                    attributes: [{ "name": "@default", "args": [{ "value": 0 }] }, { "name": "@map", "args": [{ "value": "bill_counter" }] }],
                }, barcodeCounter: {
                    name: "barcodeCounter",
                    type: "Int",
                    attributes: [{ "name": "@default", "args": [{ "value": 1 }] }, { "name": "@map", "args": [{ "value": "barcode_counter" }] }],
                }, likeCompanies: {
                    name: "likeCompanies",
                    type: "LikeCompanyClient",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'company',
                }, productinput: {
                    name: "productinput",
                    type: "Productinput",
                    isDataModel: true,
                    isOptional: true,
                    backLink: 'company',
                }, variantinput: {
                    name: "variantinput",
                    type: "Variantinput",
                    isDataModel: true,
                    isOptional: true,
                    backLink: 'company',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                }, storecode: {
                    name: "storecode",
                    fields: ["storecode"]
                }, storeUniqueName: {
                    name: "storeUniqueName",
                    fields: ["storeUniqueName"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "create" }] }, { "name": "@@allow", "args": [{ "value": "update" }] }, { "name": "@@allow", "args": [{ "value": "read" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "companies" }] }],
        },
        productinput: {
            name: 'Productinput', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, name: {
                    name: "name",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, brand: {
                    name: "brand",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, category: {
                    name: "category",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, subcategory: {
                    name: "subcategory",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, description: {
                    name: "description",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'productinput',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@unique", "args": [] }, { "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                }, companyId: {
                    name: "companyId",
                    fields: ["companyId"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@map", "args": [{ "value": "product_inputs" }] }],
        },
        variantinput: {
            name: 'Variantinput', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, name: {
                    name: "name",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, code: {
                    name: "code",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, sprice: {
                    name: "sprice",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, pprice: {
                    name: "pprice",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, dprice: {
                    name: "dprice",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, discount: {
                    name: "discount",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, qty: {
                    name: "qty",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, sizes: {
                    name: "sizes",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, images: {
                    name: "images",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'variantinput',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@unique", "args": [] }, { "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                }, companyId: {
                    name: "companyId",
                    fields: ["companyId"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@map", "args": [{ "value": "variant_inputs" }] }],
        },
        distributor: {
            name: 'Distributor', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, name: {
                    name: "name",
                    type: "String",
                }, images: {
                    name: "images",
                    type: "String",
                    isOptional: true,
                }, companies: {
                    name: "companies",
                    type: "DistributorCompany",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'distributor',
                }, status: {
                    name: "status",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, accHolderName: {
                    name: "accHolderName",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "acc_holder_name" }] }],
                }, ifsc: {
                    name: "ifsc",
                    type: "String",
                    isOptional: true,
                }, accountNo: {
                    name: "accountNo",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "account_no" }] }],
                }, bankName: {
                    name: "bankName",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "bank_name" }] }],
                }, gstin: {
                    name: "gstin",
                    type: "String",
                    isOptional: true,
                }, upiId: {
                    name: "upiId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "upi_id" }] }],
                }, address: {
                    name: "address",
                    type: "Address",
                    isDataModel: true,
                    isOptional: true,
                    backLink: 'distributor',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "create" }] }, { "name": "@@allow", "args": [{ "value": "update" }, { "value": true }] }, { "name": "@@allow", "args": [{ "value": "read" }, { "value": true }] }, { "name": "@@allow", "args": [{ "value": "delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "distributors" }] }],
        },
        purchaseOrder: {
            name: 'PurchaseOrder', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@default", "args": [] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "created_at" }] }],
                }, updatedAt: {
                    name: "updatedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@updatedAt", "args": [] }, { "name": "@map", "args": [{ "value": "updated_at" }] }],
                }, products: {
                    name: "products",
                    type: "Product",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'purchaseorder',
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'purchaseOrders',
                    isRelationOwner: true,
                    onDeleteAction: 'Cascade',
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                }, paymentType: {
                    name: "paymentType",
                    type: "paymentType",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "payment_type" }] }],
                }, totalAmount: {
                    name: "totalAmount",
                    type: "Float",
                    attributes: [{ "name": "@default", "args": [{ "value": 0 }] }, { "name": "@map", "args": [{ "value": "total_amount" }] }],
                }, distributorId: {
                    name: "distributorId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "distributor_id" }] }],
                    isForeignKey: true,
                    relationField: 'distributorCompany',
                }, distributorCompany: {
                    name: "distributorCompany",
                    type: "DistributorCompany",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'purchaseOrders',
                    isRelationOwner: true,
                    onDeleteAction: 'Cascade',
                    foreignKeyMapping: { "distributorId": "distributorId", "companyId": "companyId" },
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, create, update,delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "purchase_orders" }] }],
        },
        distributorPayment: {
            name: 'DistributorPayment', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@default", "args": [] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "created_at" }] }],
                }, amount: {
                    name: "amount",
                    type: "Float",
                }, remarks: {
                    name: "remarks",
                    type: "String",
                    isOptional: true,
                }, paymentType: {
                    name: "paymentType",
                    type: "paymentType",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "payment_type" }] }],
                }, distributorId: {
                    name: "distributorId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "distributor_id" }] }],
                    isForeignKey: true,
                    relationField: 'distributorCompany',
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'distributorCompany',
                }, distributorCompany: {
                    name: "distributorCompany",
                    type: "DistributorCompany",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'distributorPayments',
                    isRelationOwner: true,
                    onDeleteAction: 'Cascade',
                    foreignKeyMapping: { "distributorId": "distributorId", "companyId": "companyId" },
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, create, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "distributor_payments" }] }],
        },
        distributorCredit: {
            name: 'DistributorCredit', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@default", "args": [] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "created_at" }] }],
                }, amount: {
                    name: "amount",
                    type: "Float",
                }, remarks: {
                    name: "remarks",
                    type: "String",
                    isOptional: true,
                }, billNo: {
                    name: "billNo",
                    type: "String",
                    isOptional: true,
                }, distributorId: {
                    name: "distributorId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "distributor_id" }] }],
                    isForeignKey: true,
                    relationField: 'distributorCompany',
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'distributorCompany',
                }, distributorCompany: {
                    name: "distributorCompany",
                    type: "DistributorCompany",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'distributorCredits',
                    isRelationOwner: true,
                    onDeleteAction: 'Cascade',
                    foreignKeyMapping: { "distributorId": "distributorId", "companyId": "companyId" },
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, create, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "distributor_credits" }] }],
        },
        user: {
            name: 'User', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, email: {
                    name: "email",
                    type: "String",
                    attributes: [{ "name": "@unique", "args": [] }, { "name": "@email", "args": [] }],
                }, name: {
                    name: "name",
                    type: "String",
                    isOptional: true,
                }, password: {
                    name: "password",
                    type: "String",
                }, status: {
                    name: "status",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, role: {
                    name: "role",
                    type: "UserRole",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "role" }] }],
                }, companies: {
                    name: "companies",
                    type: "CompanyUser",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'user',
                }, address: {
                    name: "address",
                    type: "Address",
                    isDataModel: true,
                    isOptional: true,
                    backLink: 'user',
                }, notifications: {
                    name: "notifications",
                    type: "Notification",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'user',
                }, conversations: {
                    name: "conversations",
                    type: "UserConversation",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'user',
                }, clients: {
                    name: "clients",
                    type: "UserClient",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'user',
                }, image: {
                    name: "image",
                    type: "String",
                    isOptional: true,
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                }, email: {
                    name: "email",
                    fields: ["email"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "create" }, { "value": true }] }, { "name": "@@allow", "args": [{ "value": "update" }] }, { "name": "@@allow", "args": [{ "value": "read" }] }, { "name": "@@map", "args": [{ "value": "users" }] }],
        },
        client: {
            name: 'Client', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, email: {
                    name: "email",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@unique", "args": [] }, { "name": "@email", "args": [] }],
                }, name: {
                    name: "name",
                    type: "String",
                }, password: {
                    name: "password",
                    type: "String",
                    isOptional: true,
                }, phone: {
                    name: "phone",
                    type: "String",
                    attributes: [{ "name": "@unique", "args": [] }],
                }, status: {
                    name: "status",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, pipelineStatus: {
                    name: "pipelineStatus",
                    type: "String",
                    attributes: [{ "name": "@default", "args": [{ "value": "new" }] }, { "name": "@map", "args": [{ "value": "pipeline_status" }] }],
                }, companies: {
                    name: "companies",
                    type: "CompanyClient",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'client',
                }, clientPromoCodes: {
                    name: "clientPromoCodes",
                    type: "ClientPromoCode",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'client',
                }, cart: {
                    name: "cart",
                    type: "CartCompanyClient",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'client',
                }, address: {
                    name: "address",
                    type: "Address",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'client',
                }, bills: {
                    name: "bills",
                    type: "Bill",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'client',
                }, conversations: {
                    name: "conversations",
                    type: "ClientConversation",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'client',
                }, users: {
                    name: "users",
                    type: "UserClient",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'client',
                }, newPipeline: {
                    name: "newPipeline",
                    type: "Pipeline",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [{ "value": "PipelineNewClients" }] }],
                    backLink: 'newClients',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "newPipelineId" },
                }, newPipelineId: {
                    name: "newPipelineId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "new_pipeline_id" }] }],
                    isForeignKey: true,
                    relationField: 'newPipeline',
                }, prospectPipeline: {
                    name: "prospectPipeline",
                    type: "Pipeline",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [{ "value": "PipelineProspectClients" }] }],
                    backLink: 'prospectClients',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "prospectPipelineId" },
                }, prospectPipelineId: {
                    name: "prospectPipelineId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "prospect_pipeline_id" }] }],
                    isForeignKey: true,
                    relationField: 'prospectPipeline',
                }, viewingPipeline: {
                    name: "viewingPipeline",
                    type: "Pipeline",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [{ "value": "PipelineViewingClients" }] }],
                    backLink: 'viewingClients',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "viewingPipelineId" },
                }, viewingPipelineId: {
                    name: "viewingPipelineId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "viewing_pipeline_id" }] }],
                    isForeignKey: true,
                    relationField: 'viewingPipeline',
                }, rejectPipeline: {
                    name: "rejectPipeline",
                    type: "Pipeline",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [{ "value": "PipelineRejectClients" }] }],
                    backLink: 'rejectClients',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "rejectPipelineId" },
                }, rejectPipelineId: {
                    name: "rejectPipelineId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "reject_pipeline_id" }] }],
                    isForeignKey: true,
                    relationField: 'rejectPipeline',
                }, closePipeline: {
                    name: "closePipeline",
                    type: "Pipeline",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [{ "value": "PipelineCloseClients" }] }],
                    backLink: 'closeClients',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "closePipelineId" },
                }, closePipelineId: {
                    name: "closePipelineId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "close_pipeline_id" }] }],
                    isForeignKey: true,
                    relationField: 'closePipeline',
                }, notifications: {
                    name: "notifications",
                    type: "Notification",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'client',
                }, likeCompanies: {
                    name: "likeCompanies",
                    type: "LikeCompanyClient",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'client',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                }, email: {
                    name: "email",
                    fields: ["email"]
                }, phone: {
                    name: "phone",
                    fields: ["phone"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "read, create, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "clients" }] }],
        },
        pipeline: {
            name: 'Pipeline', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'pipeline',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }, { "name": "@unique", "args": [] }],
                    isForeignKey: true,
                    relationField: 'company',
                }, newClients: {
                    name: "newClients",
                    type: "Client",
                    isDataModel: true,
                    isArray: true,
                    attributes: [{ "name": "@relation", "args": [{ "value": "PipelineNewClients" }] }],
                    backLink: 'newPipeline',
                }, prospectClients: {
                    name: "prospectClients",
                    type: "Client",
                    isDataModel: true,
                    isArray: true,
                    attributes: [{ "name": "@relation", "args": [{ "value": "PipelineProspectClients" }] }],
                    backLink: 'prospectPipeline',
                }, viewingClients: {
                    name: "viewingClients",
                    type: "Client",
                    isDataModel: true,
                    isArray: true,
                    attributes: [{ "name": "@relation", "args": [{ "value": "PipelineViewingClients" }] }],
                    backLink: 'viewingPipeline',
                }, rejectClients: {
                    name: "rejectClients",
                    type: "Client",
                    isDataModel: true,
                    isArray: true,
                    attributes: [{ "name": "@relation", "args": [{ "value": "PipelineRejectClients" }] }],
                    backLink: 'rejectPipeline',
                }, closeClients: {
                    name: "closeClients",
                    type: "Client",
                    isDataModel: true,
                    isArray: true,
                    attributes: [{ "name": "@relation", "args": [{ "value": "PipelineCloseClients" }] }],
                    backLink: 'closePipeline',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                }, companyId: {
                    name: "companyId",
                    fields: ["companyId"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@map", "args": [{ "value": "pipelines" }] }],
        },
        category: {
            name: 'Category', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@default", "args": [] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "created_at" }] }],
                }, updatedAt: {
                    name: "updatedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@updatedAt", "args": [] }, { "name": "@map", "args": [{ "value": "updated_at" }] }],
                }, name: {
                    name: "name",
                    type: "String",
                    attributes: [{ "name": "@length", "args": [{ "value": 1 }, { "value": 256 }] }],
                }, description: {
                    name: "description",
                    type: "String",
                    isOptional: true,
                }, status: {
                    name: "status",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, image: {
                    name: "image",
                    type: "String",
                    isOptional: true,
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'categories',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                }, products: {
                    name: "products",
                    type: "Product",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'category',
                }, subcategories: {
                    name: "subcategories",
                    type: "Subcategory",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'category',
                }, entries: {
                    name: "entries",
                    type: "Entry",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'category',
                }, shortCut: {
                    name: "shortCut",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "short_cut" }] }],
                }, hsn: {
                    name: "hsn",
                    type: "String",
                    isOptional: true,
                }, taxType: {
                    name: "taxType",
                    type: "TaxType",
                    attributes: [{ "name": "@default", "args": [] }],
                }, fixedTax: {
                    name: "fixedTax",
                    type: "Float",
                    isOptional: true,
                }, thresholdAmount: {
                    name: "thresholdAmount",
                    type: "Float",
                    isOptional: true,
                }, taxBelowThreshold: {
                    name: "taxBelowThreshold",
                    type: "Float",
                    isOptional: true,
                }, taxAboveThreshold: {
                    name: "taxAboveThreshold",
                    type: "Float",
                    isOptional: true,
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read" }, { "value": true }] }, { "name": "@@allow", "args": [{ "value": "create, update, delete" }] }, { "name": "@@map", "args": [{ "value": "categories" }] }],
        },
        subcategory: {
            name: 'Subcategory', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@default", "args": [] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "created_at" }] }],
                }, updatedAt: {
                    name: "updatedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@updatedAt", "args": [] }, { "name": "@map", "args": [{ "value": "updated_at" }] }],
                }, name: {
                    name: "name",
                    type: "String",
                    attributes: [{ "name": "@length", "args": [{ "value": 1 }, { "value": 256 }] }],
                }, description: {
                    name: "description",
                    type: "String",
                    isOptional: true,
                }, status: {
                    name: "status",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, image: {
                    name: "image",
                    type: "String",
                    isOptional: true,
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'subcategories',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                }, products: {
                    name: "products",
                    type: "Product",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'subcategory',
                }, category: {
                    name: "category",
                    type: "Category",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'subcategories',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "categoryId" },
                }, categoryId: {
                    name: "categoryId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "category_id" }] }],
                    isForeignKey: true,
                    relationField: 'category',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read" }, { "value": true }] }, { "name": "@@allow", "args": [{ "value": "create, update,delete" }] }, { "name": "@@map", "args": [{ "value": "subcategories" }] }],
        },
        product: {
            name: 'Product', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@default", "args": [] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "created_at" }] }],
                }, updatedAt: {
                    name: "updatedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@updatedAt", "args": [] }, { "name": "@map", "args": [{ "value": "updated_at" }] }],
                }, name: {
                    name: "name",
                    type: "String",
                }, brand: {
                    name: "brand",
                    type: "String",
                    isOptional: true,
                }, status: {
                    name: "status",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, rating: {
                    name: "rating",
                    type: "Float",
                    isOptional: true,
                }, description: {
                    name: "description",
                    type: "String",
                    isOptional: true,
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'products',
                    isRelationOwner: true,
                    onDeleteAction: 'Cascade',
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                }, category: {
                    name: "category",
                    type: "Category",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'products',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "categoryId" },
                }, categoryId: {
                    name: "categoryId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "category_id" }] }],
                    isForeignKey: true,
                    relationField: 'category',
                }, subcategory: {
                    name: "subcategory",
                    type: "Subcategory",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'products',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "subcategoryId" },
                }, subcategoryId: {
                    name: "subcategoryId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "subcategory_id" }] }],
                    isForeignKey: true,
                    relationField: 'subcategory',
                }, variants: {
                    name: "variants",
                    type: "Variant",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'product',
                }, purchaseorder: {
                    name: "purchaseorder",
                    type: "PurchaseOrder",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'products',
                    isRelationOwner: true,
                    onDeleteAction: 'Cascade',
                    foreignKeyMapping: { "id": "purchaseorderId" },
                }, purchaseorderId: {
                    name: "purchaseorderId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "purchaseorder_id" }] }],
                    isForeignKey: true,
                    relationField: 'purchaseorder',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read" }, { "value": true }] }, { "name": "@@allow", "args": [{ "value": "read, create, update, delete" }] }, { "name": "@@map", "args": [{ "value": "products" }] }],
        },
        variant: {
            name: 'Variant', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@default", "args": [] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "created_at" }] }],
                }, updatedAt: {
                    name: "updatedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@updatedAt", "args": [] }, { "name": "@map", "args": [{ "value": "updated_at" }] }],
                }, name: {
                    name: "name",
                    type: "String",
                }, code: {
                    name: "code",
                    type: "String",
                    isOptional: true,
                }, status: {
                    name: "status",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, sprice: {
                    name: "sprice",
                    type: "Float",
                    attributes: [{ "name": "@map", "args": [{ "value": "s_price" }] }],
                }, pprice: {
                    name: "pprice",
                    type: "Float",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "p_price" }] }],
                }, discount: {
                    name: "discount",
                    type: "Float",
                    isOptional: true,
                }, dprice: {
                    name: "dprice",
                    type: "Float",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "d_price" }] }],
                }, images: {
                    name: "images",
                    type: "String",
                    isArray: true,
                }, tax: {
                    name: "tax",
                    type: "Float",
                    attributes: [{ "name": "@default", "args": [{ "value": 0 }] }],
                }, product: {
                    name: "product",
                    type: "Product",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'variants',
                    isRelationOwner: true,
                    onDeleteAction: 'Cascade',
                    foreignKeyMapping: { "id": "productId" },
                }, productId: {
                    name: "productId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "product_id" }] }],
                    isForeignKey: true,
                    relationField: 'product',
                }, items: {
                    name: "items",
                    type: "Item",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'variant',
                }, entries: {
                    name: "entries",
                    type: "Entry",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'variant',
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'variants',
                    isRelationOwner: true,
                    onDeleteAction: 'Cascade',
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                }, VariantSizeBarcode: {
                    name: "VariantSizeBarcode",
                    type: "VariantSizeBarcode",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'variant',
                }, sold: {
                    name: "sold",
                    type: "Int",
                    isOptional: true,
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read" }, { "value": true }] }, { "name": "@@allow", "args": [{ "value": "update" }, { "value": true }] }, { "name": "@@allow", "args": [{ "value": "read, create, update, delete" }] }, { "name": "@@map", "args": [{ "value": "variants" }] }],
        },
        item: {
            name: 'Item', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@default", "args": [] }],
                }, barcode: {
                    name: "barcode",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@db.Text", "args": [] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "created_at" }] }],
                }, updatedAt: {
                    name: "updatedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@updatedAt", "args": [] }, { "name": "@map", "args": [{ "value": "updated_at" }] }],
                }, variant: {
                    name: "variant",
                    type: "Variant",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'items',
                    isRelationOwner: true,
                    onDeleteAction: 'Cascade',
                    foreignKeyMapping: { "id": "variantId" },
                }, variantId: {
                    name: "variantId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "variant_id" }] }],
                    isForeignKey: true,
                    relationField: 'variant',
                }, size: {
                    name: "size",
                    type: "String",
                    isOptional: true,
                }, qty: {
                    name: "qty",
                    type: "Int",
                    isOptional: true,
                    attributes: [{ "name": "@default", "args": [{ "value": 0 }] }],
                }, entry: {
                    name: "entry",
                    type: "Entry",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'item',
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'items',
                    isRelationOwner: true,
                    onDeleteAction: 'Cascade',
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read" }, { "value": true }] }, { "name": "@@allow", "args": [{ "value": "read, create, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "items" }] }],
        },
        bill: {
            name: 'Bill', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@map", "args": [{ "value": "created_at" }] }],
                }, invoiceNumber: {
                    name: "invoiceNumber",
                    type: "Int",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "invoice_number" }] }],
                }, subtotal: {
                    name: "subtotal",
                    type: "Float",
                    isOptional: true,
                }, discount: {
                    name: "discount",
                    type: "Float",
                    isOptional: true,
                }, tax: {
                    name: "tax",
                    type: "Float",
                    isOptional: true,
                }, grandTotal: {
                    name: "grandTotal",
                    type: "Float",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "grand_total" }] }],
                }, returnAmt: {
                    name: "returnAmt",
                    type: "Float",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "return_Amt" }] }],
                }, deliveryFees: {
                    name: "deliveryFees",
                    type: "Float",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "delivery_fees" }] }],
                }, paymentMethod: {
                    name: "paymentMethod",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "payment_method" }] }],
                }, splitPayments: {
                    name: "splitPayments",
                    type: "Json",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "split_payments" }] }],
                }, paymentStatus: {
                    name: "paymentStatus",
                    type: "PaymentStatus",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "payment_status" }] }],
                }, transactionId: {
                    name: "transactionId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@unique", "args": [] }, { "name": "@map", "args": [{ "value": "transaction_id" }] }],
                }, notes: {
                    name: "notes",
                    type: "String",
                    isOptional: true,
                }, type: {
                    name: "type",
                    type: "OrderType",
                    isOptional: true,
                }, status: {
                    name: "status",
                    type: "OrderStatus",
                    isOptional: true,
                }, deleted: {
                    name: "deleted",
                    type: "Boolean",
                    isOptional: true,
                    attributes: [{ "name": "@default", "args": [{ "value": false }] }],
                }, bookingDate: {
                    name: "bookingDate",
                    type: "DateTime",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "booking_date" }] }],
                }, returnDeadline: {
                    name: "returnDeadline",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "return_deadline" }] }],
                }, entries: {
                    name: "entries",
                    type: "Entry",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'bill',
                }, billHistories: {
                    name: "billHistories",
                    type: "BillHistory",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'bill',
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'bills',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                }, account: {
                    name: "account",
                    type: "Account",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'bill',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "accountId" },
                }, accountId: {
                    name: "accountId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "account_id" }] }],
                    isForeignKey: true,
                    relationField: 'account',
                }, client: {
                    name: "client",
                    type: "Client",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'bills',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "clientId" },
                }, clientId: {
                    name: "clientId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "client_id" }] }],
                    isForeignKey: true,
                    relationField: 'client',
                }, address: {
                    name: "address",
                    type: "Address",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'bill',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "addressId" },
                }, addressId: {
                    name: "addressId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "address_id" }] }],
                    isForeignKey: true,
                    relationField: 'address',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                }, transactionId: {
                    name: "transactionId",
                    fields: ["transactionId"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "create, read, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "bills" }] }],
        },
        entry: {
            name: 'Entry', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, name: {
                    name: "name",
                    type: "String",
                    isOptional: true,
                }, barcode: {
                    name: "barcode",
                    type: "String",
                    isOptional: true,
                }, qty: {
                    name: "qty",
                    type: "Float",
                    isOptional: true,
                }, rate: {
                    name: "rate",
                    type: "Float",
                    isOptional: true,
                }, discount: {
                    name: "discount",
                    type: "Float",
                    isOptional: true,
                }, tax: {
                    name: "tax",
                    type: "Float",
                    isOptional: true,
                }, value: {
                    name: "value",
                    type: "Float",
                    isOptional: true,
                }, size: {
                    name: "size",
                    type: "String",
                    isOptional: true,
                }, variant: {
                    name: "variant",
                    type: "Variant",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'entries',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "variantId" },
                }, variantId: {
                    name: "variantId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "variant_id" }] }],
                    isForeignKey: true,
                    relationField: 'variant',
                }, outOfStock: {
                    name: "outOfStock",
                    type: "Boolean",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "out_of_stock" }] }],
                }, category: {
                    name: "category",
                    type: "Category",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'entries',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "categoryId" },
                }, categoryId: {
                    name: "categoryId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "category_id" }] }],
                    isForeignKey: true,
                    relationField: 'category',
                }, bill: {
                    name: "bill",
                    type: "Bill",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'entries',
                    isRelationOwner: true,
                    onDeleteAction: 'Cascade',
                    foreignKeyMapping: { "id": "billId" },
                }, billId: {
                    name: "billId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "bill_id" }] }],
                    isForeignKey: true,
                    relationField: 'bill',
                }, item: {
                    name: "item",
                    type: "Item",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'entry',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "itemId" },
                }, itemId: {
                    name: "itemId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "item_id" }] }],
                    isForeignKey: true,
                    relationField: 'item',
                }, return: {
                    name: "return",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": false }] }, { "name": "@map", "args": [{ "value": "return" }] }],
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "create, read, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "entries" }] }],
        },
        billHistory: {
            name: 'BillHistory', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, data: {
                    name: "data",
                    type: "Json",
                }, changedAt: {
                    name: "changedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "changed_at" }] }],
                }, operation: {
                    name: "operation",
                    type: "String",
                }, bill: {
                    name: "bill",
                    type: "Bill",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'billHistories',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "billId" },
                }, billId: {
                    name: "billId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "bill_id" }] }],
                    isForeignKey: true,
                    relationField: 'bill',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "create, read, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "bill_history" }] }],
        },
        account: {
            name: 'Account', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, name: {
                    name: "name",
                    type: "String",
                }, phone: {
                    name: "phone",
                    type: "String",
                }, bill: {
                    name: "bill",
                    type: "Bill",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'account',
                }, address: {
                    name: "address",
                    type: "Address",
                    isDataModel: true,
                    isOptional: true,
                    backLink: 'account',
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'accounts',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "create, read, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "accounts" }] }],
        },
        tokenEntry: {
            name: 'TokenEntry', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@map", "args": [{ "value": "created_at" }] }],
                }, tokenNo: {
                    name: "tokenNo",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "token_no" }] }],
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'tokenbills',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                }, itemId: {
                    name: "itemId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "item_id" }] }],
                }, variantId: {
                    name: "variantId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "variant_id" }] }],
                }, barcode: {
                    name: "barcode",
                    type: "String",
                }, categoryId: {
                    name: "categoryId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "category_id" }] }],
                }, size: {
                    name: "size",
                    type: "String",
                }, name: {
                    name: "name",
                    type: "String",
                }, qty: {
                    name: "qty",
                    type: "Int",
                }, rate: {
                    name: "rate",
                    type: "Int",
                }, discount: {
                    name: "discount",
                    type: "Int",
                }, tax: {
                    name: "tax",
                    type: "Int",
                }, value: {
                    name: "value",
                    type: "Int",
                }, sizes: {
                    name: "sizes",
                    type: "Json",
                }, totalQty: {
                    name: "totalQty",
                    type: "Int",
                    attributes: [{ "name": "@map", "args": [{ "value": "total_qty" }] }],
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "create, read, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "token_entries" }] }],
        },
        expenseCategory: {
            name: 'ExpenseCategory', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, name: {
                    name: "name",
                    type: "String",
                    attributes: [{ "name": "@length", "args": [{ "value": 1 }, { "value": 256 }] }],
                }, status: {
                    name: "status",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "created_at" }] }],
                }, updatedAt: {
                    name: "updatedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@updatedAt", "args": [] }, { "name": "@map", "args": [{ "value": "updated_at" }] }],
                }, expenses: {
                    name: "expenses",
                    type: "Expense",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'expensecategory',
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'expenseCategories',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "create, read, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "expense_categories" }] }],
        },
        expense: {
            name: 'Expense', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, expenseDate: {
                    name: "expenseDate",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "expense_date" }] }],
                }, note: {
                    name: "note",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@length", "args": [{ "value": 1 }, { "value": 512 }] }],
                }, currency: {
                    name: "currency",
                    type: "String",
                    attributes: [{ "name": "@default", "args": [{ "value": "INR" }] }],
                }, paymentMode: {
                    name: "paymentMode",
                    type: "PaymentMode",
                    attributes: [{ "name": "@map", "args": [{ "value": "payment_mode" }] }],
                }, status: {
                    name: "status",
                    type: "String",
                    attributes: [{ "name": "@default", "args": [{ "value": "Pending" }] }],
                }, receipt: {
                    name: "receipt",
                    type: "String",
                    isOptional: true,
                }, receiptName: {
                    name: "receiptName",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "receipt_name" }] }],
                }, taxAmount: {
                    name: "taxAmount",
                    type: "Float",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "tax_amount" }] }],
                }, totalAmount: {
                    name: "totalAmount",
                    type: "Float",
                    attributes: [{ "name": "@map", "args": [{ "value": "total_amount" }] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "created_at" }] }],
                }, updatedAt: {
                    name: "updatedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@updatedAt", "args": [] }, { "name": "@map", "args": [{ "value": "updated_at" }] }],
                }, expensecategory: {
                    name: "expensecategory",
                    type: "ExpenseCategory",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'expenses',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "expensecategoryId" },
                }, expensecategoryId: {
                    name: "expensecategoryId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "expense_category_id" }] }],
                    isForeignKey: true,
                    relationField: 'expensecategory',
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'expenses',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "create, read, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "expenses" }] }],
        },
        payment: {
            name: 'Payment', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, paymentDate: {
                    name: "paymentDate",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "payment_date" }] }],
                }, paymentMode: {
                    name: "paymentMode",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "payment_mode" }] }],
                }, paymentReference: {
                    name: "paymentReference",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "payment_reference" }] }],
                }, amount: {
                    name: "amount",
                    type: "Float",
                }, currency: {
                    name: "currency",
                    type: "String",
                    attributes: [{ "name": "@default", "args": [{ "value": "INR" }] }],
                }, status: {
                    name: "status",
                    type: "String",
                    attributes: [{ "name": "@default", "args": [{ "value": "Completed" }] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "created_at" }] }],
                }, updatedAt: {
                    name: "updatedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@updatedAt", "args": [] }, { "name": "@map", "args": [{ "value": "updated_at" }] }],
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'payment',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "create, read, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "payments" }] }],
        },
        address: {
            name: 'Address', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "created_at" }] }],
                }, updatedAt: {
                    name: "updatedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@updatedAt", "args": [] }, { "name": "@map", "args": [{ "value": "updated_at" }] }],
                }, name: {
                    name: "name",
                    type: "String",
                    isOptional: true,
                }, street: {
                    name: "street",
                    type: "String",
                }, locality: {
                    name: "locality",
                    type: "String",
                }, city: {
                    name: "city",
                    type: "String",
                }, state: {
                    name: "state",
                    type: "String",
                }, pincode: {
                    name: "pincode",
                    type: "String",
                }, active: {
                    name: "active",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, user: {
                    name: "user",
                    type: "User",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'address',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "userId" },
                }, userId: {
                    name: "userId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "user_id" }] }, { "name": "@unique", "args": [] }],
                    isForeignKey: true,
                    relationField: 'user',
                }, client: {
                    name: "client",
                    type: "Client",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'address',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "clientId" },
                }, clientId: {
                    name: "clientId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "client_id" }] }],
                    isForeignKey: true,
                    relationField: 'client',
                }, distributor: {
                    name: "distributor",
                    type: "Distributor",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'address',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "distributorId" },
                }, distributorId: {
                    name: "distributorId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "distributor_id" }] }, { "name": "@unique", "args": [] }],
                    isForeignKey: true,
                    relationField: 'distributor',
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'address',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }, { "name": "@unique", "args": [] }],
                    isForeignKey: true,
                    relationField: 'company',
                }, account: {
                    name: "account",
                    type: "Account",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'address',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "accountId" },
                }, accountId: {
                    name: "accountId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "account_id" }] }, { "name": "@unique", "args": [] }],
                    isForeignKey: true,
                    relationField: 'account',
                }, bill: {
                    name: "bill",
                    type: "Bill",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'address',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                }, userId: {
                    name: "userId",
                    fields: ["userId"]
                }, distributorId: {
                    name: "distributorId",
                    fields: ["distributorId"]
                }, companyId: {
                    name: "companyId",
                    fields: ["companyId"]
                }, accountId: {
                    name: "accountId",
                    fields: ["accountId"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "create, read, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "addresses" }] }],
        },
        conversation: {
            name: 'Conversation', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "created_at" }] }],
                }, updatedAt: {
                    name: "updatedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@updatedAt", "args": [] }, { "name": "@map", "args": [{ "value": "updated_at" }] }],
                }, messages: {
                    name: "messages",
                    type: "Message",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'conversation',
                }, users: {
                    name: "users",
                    type: "UserConversation",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'conversation',
                }, clients: {
                    name: "clients",
                    type: "ClientConversation",
                    isDataModel: true,
                    isArray: true,
                    backLink: 'conversation',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "create, read, update, delete" }] }, { "name": "@@map", "args": [{ "value": "conversations" }] }],
        },
        message: {
            name: 'Message', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }, { "name": "@map", "args": [{ "value": "created_at" }] }],
                }, updatedAt: {
                    name: "updatedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@updatedAt", "args": [] }, { "name": "@map", "args": [{ "value": "updated_at" }] }],
                }, conversationId: {
                    name: "conversationId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "conversation_id" }] }],
                    isForeignKey: true,
                    relationField: 'conversation',
                }, conversation: {
                    name: "conversation",
                    type: "Conversation",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'messages',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "conversationId" },
                }, senderId: {
                    name: "senderId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "sender_id" }] }],
                }, text: {
                    name: "text",
                    type: "String",
                }, seen: {
                    name: "seen",
                    type: "String",
                    isArray: true,
                }, replyto: {
                    name: "replyto",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "reply_to" }] }],
                }, edited: {
                    name: "edited",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": false }] }],
                }, deleted: {
                    name: "deleted",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": false }] }],
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "create, read, update, delete" }] }, { "name": "@@map", "args": [{ "value": "messages" }] }],
        },
        companyUser: {
            name: 'CompanyUser', fields: {
                companyId: {
                    name: "companyId",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'users',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, userId: {
                    name: "userId",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "user_id" }] }],
                    isForeignKey: true,
                    relationField: 'user',
                }, user: {
                    name: "user",
                    type: "User",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'companies',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "userId" },
                },
            }, uniqueConstraints: {
                companyId_userId: {
                    name: "companyId_userId",
                    fields: ["companyId", "userId"]
                },
            },
            attributes: [{ "name": "@@id", "args": [] }, { "name": "@@allow", "args": [{ "value": "read,create, update, delete" }] }, { "name": "@@map", "args": [{ "value": "company_users" }] }],
        },
        companyClient: {
            name: 'CompanyClient', fields: {
                companyId: {
                    name: "companyId",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "company_id" }] }],
                    isForeignKey: true,
                    relationField: 'company',
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'clients',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, clientId: {
                    name: "clientId",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "client_id" }] }],
                    isForeignKey: true,
                    relationField: 'client',
                }, client: {
                    name: "client",
                    type: "Client",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'companies',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "clientId" },
                },
            }, uniqueConstraints: {
                companyId_clientId: {
                    name: "companyId_clientId",
                    fields: ["companyId", "clientId"]
                },
            },
            attributes: [{ "name": "@@id", "args": [] }, { "name": "@@allow", "args": [{ "value": "read,create, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "company_clients" }] }],
        },
        userConversation: {
            name: 'UserConversation', fields: {
                userId: {
                    name: "userId",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "user_id" }] }],
                    isForeignKey: true,
                    relationField: 'user',
                }, conversationId: {
                    name: "conversationId",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "conversation_id" }] }],
                    isForeignKey: true,
                    relationField: 'conversation',
                }, user: {
                    name: "user",
                    type: "User",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'conversations',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "userId" },
                }, conversation: {
                    name: "conversation",
                    type: "Conversation",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'users',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "conversationId" },
                },
            }, uniqueConstraints: {
                userId_conversationId: {
                    name: "userId_conversationId",
                    fields: ["userId", "conversationId"]
                },
            },
            attributes: [{ "name": "@@id", "args": [] }, { "name": "@@allow", "args": [{ "value": "read,create, update, delete" }] }, { "name": "@@map", "args": [{ "value": "user_conversations" }] }],
        },
        clientConversation: {
            name: 'ClientConversation', fields: {
                clientId: {
                    name: "clientId",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "client_id" }] }],
                    isForeignKey: true,
                    relationField: 'client',
                }, conversationId: {
                    name: "conversationId",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "conversation_id" }] }],
                    isForeignKey: true,
                    relationField: 'conversation',
                }, client: {
                    name: "client",
                    type: "Client",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'conversations',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "clientId" },
                }, conversation: {
                    name: "conversation",
                    type: "Conversation",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'clients',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "conversationId" },
                },
            }, uniqueConstraints: {
                clientId_conversationId: {
                    name: "clientId_conversationId",
                    fields: ["clientId", "conversationId"]
                },
            },
            attributes: [{ "name": "@@id", "args": [] }, { "name": "@@allow", "args": [{ "value": "read,create, update, delete" }] }, { "name": "@@map", "args": [{ "value": "client_conversations" }] }],
        },
        userClient: {
            name: 'UserClient', fields: {
                clientId: {
                    name: "clientId",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "client_id" }] }],
                    isForeignKey: true,
                    relationField: 'client',
                }, userId: {
                    name: "userId",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "user_id" }] }],
                    isForeignKey: true,
                    relationField: 'user',
                }, client: {
                    name: "client",
                    type: "Client",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'users',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "clientId" },
                }, user: {
                    name: "user",
                    type: "User",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'clients',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "userId" },
                },
            }, uniqueConstraints: {
                clientId_userId: {
                    name: "clientId_userId",
                    fields: ["clientId", "userId"]
                },
            },
            attributes: [{ "name": "@@id", "args": [] }, { "name": "@@allow", "args": [{ "value": "read,create, update, delete" }] }, { "name": "@@map", "args": [{ "value": "user_clients" }] }],
        },
        variantSizeBarcode: {
            name: 'VariantSizeBarcode', fields: {
                id: {
                    name: "id",
                    type: "Int",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@default", "args": [] }],
                    isAutoIncrement: true,
                }, variantId: {
                    name: "variantId",
                    type: "String",
                    attributes: [{ "name": "@map", "args": [{ "value": "variant_id" }] }],
                    isForeignKey: true,
                    relationField: 'variant',
                }, size: {
                    name: "size",
                    type: "String",
                    isOptional: true,
                }, barcode: {
                    name: "barcode",
                    type: "String",
                    attributes: [{ "name": "@unique", "args": [] }],
                }, variant: {
                    name: "variant",
                    type: "Variant",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'VariantSizeBarcode',
                    isRelationOwner: true,
                    onDeleteAction: 'Cascade',
                    foreignKeyMapping: { "id": "variantId" },
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                }, barcode: {
                    name: "barcode",
                    fields: ["barcode"]
                }, variantId_size: {
                    name: "variantId_size",
                    fields: ["variantId", "size"]
                },
            },
            attributes: [{ "name": "@@unique", "args": [] }, { "name": "@@allow", "args": [{ "value": "read" }, { "value": true }] }, { "name": "@@allow", "args": [{ "value": "read, create, update" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "variant_size_barcodes" }] }],
        },
        emailOtp: {
            name: 'EmailOtp', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, email: {
                    name: "email",
                    type: "String",
                    attributes: [{ "name": "@unique", "args": [] }, { "name": "@email", "args": [] }],
                }, otp: {
                    name: "otp",
                    type: "String",
                }, expiresAt: {
                    name: "expiresAt",
                    type: "DateTime",
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                }, email: {
                    name: "email",
                    fields: ["email"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@index", "args": [] }, { "name": "@@allow", "args": [{ "value": "read, create, update,delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "email_otp" }] }],
        },
        notification: {
            name: 'Notification', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@default", "args": [] }],
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'notifications',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    isForeignKey: true,
                    relationField: 'company',
                }, user: {
                    name: "user",
                    type: "User",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'notifications',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "userId" },
                }, userId: {
                    name: "userId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "user_id" }] }],
                    isForeignKey: true,
                    relationField: 'user',
                }, clientId: {
                    name: "clientId",
                    type: "String",
                    isOptional: true,
                    attributes: [{ "name": "@map", "args": [{ "value": "client_id" }] }],
                    isForeignKey: true,
                    relationField: 'client',
                }, client: {
                    name: "client",
                    type: "Client",
                    isDataModel: true,
                    isOptional: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'notifications',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "clientId" },
                }, type: {
                    name: "type",
                    type: "NotificationType",
                }, title: {
                    name: "title",
                    type: "String",
                }, message: {
                    name: "message",
                    type: "String",
                }, read: {
                    name: "read",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": false }] }],
                }, actionPath: {
                    name: "actionPath",
                    type: "String",
                    isOptional: true,
                }, metadata: {
                    name: "metadata",
                    type: "Json",
                    isOptional: true,
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }],
                }, updatedAt: {
                    name: "updatedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@updatedAt", "args": [] }],
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@index", "args": [] }, { "name": "@@allow", "args": [{ "value": "read, create, update,delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "notifications" }] }],
        },
        promoCode: {
            name: 'PromoCode', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@default", "args": [] }],
                }, code: {
                    name: "code",
                    type: "String",
                    attributes: [{ "name": "@unique", "args": [] }],
                }, discountPercent: {
                    name: "discountPercent",
                    type: "Int",
                }, minAmount: {
                    name: "minAmount",
                    type: "Float",
                }, expiresAt: {
                    name: "expiresAt",
                    type: "DateTime",
                }, isActive: {
                    name: "isActive",
                    type: "Boolean",
                    attributes: [{ "name": "@default", "args": [{ "value": true }] }],
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'promoCodes',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    isForeignKey: true,
                    relationField: 'company',
                }, usageLimit: {
                    name: "usageLimit",
                    type: "Int",
                    isOptional: true,
                }, usageCount: {
                    name: "usageCount",
                    type: "Int",
                    isOptional: true,
                }, clientsUsed: {
                    name: "clientsUsed",
                    type: "ClientPromoCode",
                    isDataModel: true,
                    isArray: true,
                    attributes: [{ "name": "@relation", "args": [{ "value": "PromoCodeToClientPromoCode" }] }],
                    backLink: 'promoCode',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                }, code: {
                    name: "code",
                    fields: ["code"]
                },
            },
            attributes: [{ "name": "@@index", "args": [] }, { "name": "@@allow", "args": [{ "value": "read, create, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "promo_codes" }] }],
        },
        clientPromoCode: {
            name: 'ClientPromoCode', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@default", "args": [] }],
                }, clientId: {
                    name: "clientId",
                    type: "String",
                    isForeignKey: true,
                    relationField: 'client',
                }, promoCodeId: {
                    name: "promoCodeId",
                    type: "String",
                    isForeignKey: true,
                    relationField: 'promoCode',
                }, usedAt: {
                    name: "usedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }],
                }, client: {
                    name: "client",
                    type: "Client",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'clientPromoCodes',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "clientId" },
                }, promoCode: {
                    name: "promoCode",
                    type: "PromoCode",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [{ "value": "PromoCodeToClientPromoCode" }] }],
                    backLink: 'clientsUsed',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "promoCodeId" },
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@index", "args": [] }, { "name": "@@allow", "args": [{ "value": "read, create, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "client_promo_code" }] }],
        },
        cart: {
            name: 'Cart', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, items: {
                    name: "items",
                    type: "Json",
                    isOptional: true,
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }],
                }, updatedAt: {
                    name: "updatedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@updatedAt", "args": [] }],
                }, clientCompany: {
                    name: "clientCompany",
                    type: "CartCompanyClient",
                    isDataModel: true,
                    isOptional: true,
                    backLink: 'cart',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "read, create, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "cart" }] }],
        },
        cartCompanyClient: {
            name: 'CartCompanyClient', fields: {
                clientId: {
                    name: "clientId",
                    type: "String",
                    isForeignKey: true,
                    relationField: 'client',
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    isForeignKey: true,
                    relationField: 'company',
                }, cartId: {
                    name: "cartId",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@unique", "args": [] }],
                    isForeignKey: true,
                    relationField: 'cart',
                }, client: {
                    name: "client",
                    type: "Client",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'cart',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "clientId" },
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'carts',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, cart: {
                    name: "cart",
                    type: "Cart",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'clientCompany',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "cartId" },
                },
            }, uniqueConstraints: {
                cartId: {
                    name: "cartId",
                    fields: ["cartId"]
                }, clientId_companyId: {
                    name: "clientId_companyId",
                    fields: ["clientId", "companyId"]
                },
            },
            attributes: [{ "name": "@@unique", "args": [] }, { "name": "@@allow", "args": [{ "value": "read, create, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "cart_company_client" }] }],
        },
        like: {
            name: 'Like', fields: {
                id: {
                    name: "id",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@id", "args": [] }, { "name": "@unique", "args": [] }, { "name": "@default", "args": [] }],
                }, variantIds: {
                    name: "variantIds",
                    type: "String",
                    isArray: true,
                    attributes: [{ "name": "@default", "args": [] }],
                }, createdAt: {
                    name: "createdAt",
                    type: "DateTime",
                    attributes: [{ "name": "@default", "args": [] }],
                }, updatedAt: {
                    name: "updatedAt",
                    type: "DateTime",
                    attributes: [{ "name": "@updatedAt", "args": [] }],
                }, clientCompany: {
                    name: "clientCompany",
                    type: "LikeCompanyClient",
                    isDataModel: true,
                    isOptional: true,
                    backLink: 'like',
                },
            }, uniqueConstraints: {
                id: {
                    name: "id",
                    fields: ["id"]
                },
            },
            attributes: [{ "name": "@@allow", "args": [{ "value": "read, update" }] }, { "name": "@@allow", "args": [{ "value": "read, create, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "likes" }] }, { "name": "@@index", "args": [] }],
        },
        likeCompanyClient: {
            name: 'LikeCompanyClient', fields: {
                clientId: {
                    name: "clientId",
                    type: "String",
                    isForeignKey: true,
                    relationField: 'client',
                }, companyId: {
                    name: "companyId",
                    type: "String",
                    isForeignKey: true,
                    relationField: 'company',
                }, likeId: {
                    name: "likeId",
                    type: "String",
                    isId: true,
                    attributes: [{ "name": "@unique", "args": [] }],
                    isForeignKey: true,
                    relationField: 'like',
                }, client: {
                    name: "client",
                    type: "Client",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'likeCompanies',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "clientId" },
                }, company: {
                    name: "company",
                    type: "Company",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'likeCompanies',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "companyId" },
                }, like: {
                    name: "like",
                    type: "Like",
                    isDataModel: true,
                    attributes: [{ "name": "@relation", "args": [] }],
                    backLink: 'clientCompany',
                    isRelationOwner: true,
                    foreignKeyMapping: { "id": "likeId" },
                },
            }, uniqueConstraints: {
                likeId: {
                    name: "likeId",
                    fields: ["likeId"]
                }, clientId_companyId: {
                    name: "clientId_companyId",
                    fields: ["clientId", "companyId"]
                },
            },
            attributes: [{ "name": "@@unique", "args": [] }, { "name": "@@allow", "args": [{ "value": "read, create, update, delete" }, { "value": true }] }, { "name": "@@map", "args": [{ "value": "like_company_client" }] }],
        },
    },
    deleteCascade: {
        distributorCompany: ['PurchaseOrder', 'DistributorPayment', 'DistributorCredit'],
        company: ['DistributorCompany', 'PurchaseOrder', 'Product', 'Variant', 'Item'],
        distributor: ['DistributorCompany'],
        purchaseOrder: ['Product'],
        product: ['Variant'],
        variant: ['Item', 'VariantSizeBarcode'],
        bill: ['Entry'],
    },
    authModel: 'User'
};
exports.default = metadata;
