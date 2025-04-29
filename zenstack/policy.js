"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const policy = {
    policy: { company: {
            modelLevel: { read: { guard: Company_read, },
                create: { guard: Company_create, },
                update: { guard: Company_update, },
                postUpdate: { guard: Company_postUpdate, },
                delete: { guard: Company_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        distributor: {
            modelLevel: { read: { guard: Distributor_read, },
                create: { guard: Distributor_create, },
                update: { guard: Distributor_update, },
                postUpdate: { guard: Distributor_postUpdate, },
                delete: { guard: Distributor_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        user: {
            modelLevel: { read: { guard: User_read, },
                create: { guard: User_create, inputChecker: User_create_input, },
                update: { guard: User_update, },
                postUpdate: { guard: User_postUpdate, },
                delete: { guard: User_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        client: {
            modelLevel: { read: { guard: Client_read, },
                create: { guard: Client_create, inputChecker: Client_create_input, },
                update: { guard: Client_update, },
                postUpdate: { guard: Client_postUpdate, },
                delete: { guard: Client_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        pipeline: {
            modelLevel: { read: { guard: Pipeline_read, },
                create: { guard: Pipeline_create, inputChecker: Pipeline_create_input, },
                update: { guard: Pipeline_update, },
                postUpdate: { guard: Pipeline_postUpdate, },
                delete: { guard: Pipeline_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        category: {
            modelLevel: { read: { guard: Category_read, },
                create: { guard: Category_create, },
                update: { guard: Category_update, },
                postUpdate: { guard: Category_postUpdate, },
                delete: { guard: Category_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        subcategory: {
            modelLevel: { read: { guard: Subcategory_read, },
                create: { guard: Subcategory_create, },
                update: { guard: Subcategory_update, },
                postUpdate: { guard: Subcategory_postUpdate, },
                delete: { guard: Subcategory_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        product: {
            modelLevel: { read: { guard: Product_read, },
                create: { guard: Product_create, },
                update: { guard: Product_update, },
                postUpdate: { guard: Product_postUpdate, },
                delete: { guard: Product_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        variant: {
            modelLevel: { read: { guard: Variant_read, },
                create: { guard: Variant_create, },
                update: { guard: Variant_update, },
                postUpdate: { guard: Variant_postUpdate, },
                delete: { guard: Variant_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        item: {
            modelLevel: { read: { guard: Item_read, },
                create: { guard: Item_create, inputChecker: Item_create_input, },
                update: { guard: Item_update, },
                postUpdate: { guard: Item_postUpdate, },
                delete: { guard: Item_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        purchaseOrder: {
            modelLevel: { read: { guard: PurchaseOrder_read, },
                create: { guard: PurchaseOrder_create, inputChecker: PurchaseOrder_create_input, },
                update: { guard: PurchaseOrder_update, },
                postUpdate: { guard: PurchaseOrder_postUpdate, },
                delete: { guard: PurchaseOrder_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        bill: {
            modelLevel: { read: { guard: Bill_read, },
                create: { guard: Bill_create, inputChecker: Bill_create_input, },
                update: { guard: Bill_update, },
                postUpdate: { guard: Bill_postUpdate, },
                delete: { guard: Bill_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        tokenEntry: {
            modelLevel: { read: { guard: TokenEntry_read, },
                create: { guard: TokenEntry_create, inputChecker: TokenEntry_create_input, },
                update: { guard: TokenEntry_update, },
                postUpdate: { guard: TokenEntry_postUpdate, },
                delete: { guard: TokenEntry_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        entry: {
            modelLevel: { read: { guard: Entry_read, },
                create: { guard: Entry_create, inputChecker: Entry_create_input, },
                update: { guard: Entry_update, },
                postUpdate: { guard: Entry_postUpdate, },
                delete: { guard: Entry_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        account: {
            modelLevel: { read: { guard: Account_read, },
                create: { guard: Account_create, inputChecker: Account_create_input, },
                update: { guard: Account_update, },
                postUpdate: { guard: Account_postUpdate, },
                delete: { guard: Account_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        expenseCategory: {
            modelLevel: { read: { guard: ExpenseCategory_read, },
                create: { guard: ExpenseCategory_create, inputChecker: ExpenseCategory_create_input, },
                update: { guard: ExpenseCategory_update, },
                postUpdate: { guard: ExpenseCategory_postUpdate, },
                delete: { guard: ExpenseCategory_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        expense: {
            modelLevel: { read: { guard: Expense_read, },
                create: { guard: Expense_create, inputChecker: Expense_create_input, },
                update: { guard: Expense_update, },
                postUpdate: { guard: Expense_postUpdate, },
                delete: { guard: Expense_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        payment: {
            modelLevel: { read: { guard: Payment_read, },
                create: { guard: Payment_create, inputChecker: Payment_create_input, },
                update: { guard: Payment_update, },
                postUpdate: { guard: Payment_postUpdate, },
                delete: { guard: Payment_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        address: {
            modelLevel: { read: { guard: Address_read, },
                create: { guard: Address_create, inputChecker: Address_create_input, },
                update: { guard: Address_update, },
                postUpdate: { guard: Address_postUpdate, },
                delete: { guard: Address_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        conversation: {
            modelLevel: { read: { guard: Conversation_read, },
                create: { guard: Conversation_create, inputChecker: Conversation_create_input, },
                update: { guard: Conversation_update, },
                postUpdate: { guard: Conversation_postUpdate, },
                delete: { guard: Conversation_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        message: {
            modelLevel: { read: { guard: Message_read, },
                create: { guard: Message_create, inputChecker: Message_create_input, },
                update: { guard: Message_update, },
                postUpdate: { guard: Message_postUpdate, },
                delete: { guard: Message_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        companyUser: {
            modelLevel: { read: { guard: CompanyUser_read, },
                create: { guard: CompanyUser_create, inputChecker: CompanyUser_create_input, },
                update: { guard: CompanyUser_update, },
                postUpdate: { guard: CompanyUser_postUpdate, },
                delete: { guard: CompanyUser_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        companyClient: {
            modelLevel: { read: { guard: CompanyClient_read, },
                create: { guard: CompanyClient_create, inputChecker: CompanyClient_create_input, },
                update: { guard: CompanyClient_update, },
                postUpdate: { guard: CompanyClient_postUpdate, },
                delete: { guard: CompanyClient_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        userConversation: {
            modelLevel: { read: { guard: UserConversation_read, },
                create: { guard: UserConversation_create, inputChecker: UserConversation_create_input, },
                update: { guard: UserConversation_update, },
                postUpdate: { guard: UserConversation_postUpdate, },
                delete: { guard: UserConversation_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        clientConversation: {
            modelLevel: { read: { guard: ClientConversation_read, },
                create: { guard: ClientConversation_create, inputChecker: ClientConversation_create_input, },
                update: { guard: ClientConversation_update, },
                postUpdate: { guard: ClientConversation_postUpdate, },
                delete: { guard: ClientConversation_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        userClient: {
            modelLevel: { read: { guard: UserClient_read, },
                create: { guard: UserClient_create, inputChecker: UserClient_create_input, },
                update: { guard: UserClient_update, },
                postUpdate: { guard: UserClient_postUpdate, },
                delete: { guard: UserClient_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        distributorCompany: {
            modelLevel: { read: { guard: DistributorCompany_read, },
                create: { guard: DistributorCompany_create, inputChecker: DistributorCompany_create_input, },
                update: { guard: DistributorCompany_update, },
                postUpdate: { guard: DistributorCompany_postUpdate, },
                delete: { guard: DistributorCompany_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        variantSizeBarcode: {
            modelLevel: { read: { guard: VariantSizeBarcode_read, },
                create: { guard: VariantSizeBarcode_create, inputChecker: VariantSizeBarcode_create_input, },
                update: { guard: VariantSizeBarcode_update, },
                postUpdate: { guard: VariantSizeBarcode_postUpdate, },
                delete: { guard: VariantSizeBarcode_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        emailOtp: {
            modelLevel: { read: { guard: EmailOtp_read, },
                create: { guard: EmailOtp_create, inputChecker: EmailOtp_create_input, },
                update: { guard: EmailOtp_update, },
                postUpdate: { guard: EmailOtp_postUpdate, },
                delete: { guard: EmailOtp_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
        notification: {
            modelLevel: { read: { guard: Notification_read, },
                create: { guard: Notification_create, inputChecker: Notification_create_input, },
                update: { guard: Notification_update, },
                postUpdate: { guard: Notification_postUpdate, },
                delete: { guard: Notification_delete, } },
            fieldLevel: { read: {},
                update: {},
            },
        },
    },
    validation: { company: { hasValidation: false },
        distributor: { hasValidation: false },
        user: { hasValidation: true },
        client: { hasValidation: true },
        pipeline: { hasValidation: false },
        category: { hasValidation: true },
        subcategory: { hasValidation: true },
        product: { hasValidation: false },
        variant: { hasValidation: true },
        item: { hasValidation: false },
        purchaseOrder: { hasValidation: false },
        bill: { hasValidation: false },
        tokenEntry: { hasValidation: false },
        entry: { hasValidation: false },
        account: { hasValidation: false },
        expenseCategory: { hasValidation: true },
        expense: { hasValidation: true },
        payment: { hasValidation: false },
        address: { hasValidation: false },
        conversation: { hasValidation: false },
        message: { hasValidation: false },
        companyUser: { hasValidation: false },
        companyClient: { hasValidation: false },
        userConversation: { hasValidation: false },
        clientConversation: { hasValidation: false },
        userClient: { hasValidation: false },
        distributorCompany: { hasValidation: false },
        variantSizeBarcode: { hasValidation: false },
        emailOtp: { hasValidation: true },
        notification: { hasValidation: false },
    },
    authSelector: { "role": true, "id": true },
};
function Company_read(context, db) {
    return { AND: [] };
}
function $check_Company_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Company_create(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { AND: [(user != null) ? { AND: [] } : { OR: [] }, { status: true }] };
}
function $check_Company_create(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user != null) && (input === null || input === void 0 ? void 0 : input.status))) {
        return true;
    }
    return false;
}
function Company_update(context, db) {
    var _a, _b;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { OR: [(((_b = user === null || user === void 0 ? void 0 : user.role) !== null && _b !== void 0 ? _b : null) == 'admin') ? { AND: [] } : { OR: [] }, { users: { some: (user == null) ? { OR: [] } : { user: { is: { id: user.id } } } } }] };
}
function $check_Company_update(input, context) {
    var _a, _b, _c;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (((_c = ((_b = (input === null || input === void 0 ? void 0 : input.users)) === null || _b === void 0 ? void 0 : _b.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _c !== void 0 ? _c : false)) {
        return true;
    }
    return false;
}
function Company_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Company_postUpdate(input, context) {
    return true;
}
function Company_delete(context, db) {
    return { OR: [] };
}
function $check_Company_delete(input, context) {
    return false;
}
function Distributor_read(context, db) {
    return { AND: [] };
}
function $check_Distributor_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Distributor_create(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { AND: [(user != null) ? { AND: [] } : { OR: [] }, { status: true }] };
}
function $check_Distributor_create(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user != null) && (input === null || input === void 0 ? void 0 : input.status))) {
        return true;
    }
    return false;
}
function Distributor_update(context, db) {
    return { AND: [] };
}
function $check_Distributor_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Distributor_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Distributor_postUpdate(input, context) {
    return true;
}
function Distributor_delete(context, db) {
    return { OR: [] };
}
function $check_Distributor_delete(input, context) {
    return false;
}
function User_read(context, db) {
    var _a, _b;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { OR: [(((_b = user === null || user === void 0 ? void 0 : user.role) !== null && _b !== void 0 ? _b : null) == 'admin') ? { AND: [] } : { OR: [] }, { companies: { some: { company: { users: { some: (user == null) ? { OR: [] } : { user: { is: { id: user.id } } } } } } } }] };
}
function $check_User_read(input, context) {
    var _a, _b, _c;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (((_c = ((_b = (input === null || input === void 0 ? void 0 : input.companies)) === null || _b === void 0 ? void 0 : _b.some((_item) => { var _a, _b, _c; return ((_c = ((_b = ((_a = _item === null || _item === void 0 ? void 0 : _item.company) === null || _a === void 0 ? void 0 : _a.users)) === null || _b === void 0 ? void 0 : _b.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _c !== void 0 ? _c : false); }))) !== null && _c !== void 0 ? _c : false)) {
        return true;
    }
    return false;
}
function User_create(context, db) {
    return { AND: [] };
}
function $check_User_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function User_create_input(input, context) {
    return true;
}
function User_update(context, db) {
    var _a, _b, _c, _d;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { OR: [(((_b = user === null || user === void 0 ? void 0 : user.role) !== null && _b !== void 0 ? _b : null) == 'admin') ? { AND: [] } : { OR: [] }, (((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null) == null) ? { OR: [] } : { id: { equals: ((_d = user === null || user === void 0 ? void 0 : user.id) !== null && _d !== void 0 ? _d : null) } }] };
}
function $check_User_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (((input === null || input === void 0 ? void 0 : input.id) == (user === null || user === void 0 ? void 0 : user.id))) {
        return true;
    }
    return false;
}
function User_postUpdate(context, db) {
    return { AND: [] };
}
function $check_User_postUpdate(input, context) {
    return true;
}
function User_delete(context, db) {
    return { OR: [] };
}
function $check_User_delete(input, context) {
    return false;
}
function Client_read(context, db) {
    return { AND: [] };
}
function $check_Client_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Client_create(context, db) {
    return { AND: [] };
}
function $check_Client_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Client_create_input(input, context) {
    return true;
}
function Client_update(context, db) {
    return { AND: [] };
}
function $check_Client_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Client_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Client_postUpdate(input, context) {
    return true;
}
function Client_delete(context, db) {
    return { AND: [] };
}
function $check_Client_delete(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Pipeline_read(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_Pipeline_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    return false;
}
function Pipeline_create(context, db) {
    return { OR: [] };
}
function $check_Pipeline_create(input, context) {
    return false;
}
function Pipeline_create_input(input, context) {
    return false;
}
function Pipeline_update(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_Pipeline_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    return false;
}
function Pipeline_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Pipeline_postUpdate(input, context) {
    return true;
}
function Pipeline_delete(context, db) {
    return { OR: [] };
}
function $check_Pipeline_delete(input, context) {
    return false;
}
function Category_read(context, db) {
    return { AND: [] };
}
function $check_Category_read(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Category_create(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { company: { users: { some: (user == null) ? { OR: [] } : { user: { is: { id: user.id } } } } } };
}
function $check_Category_create(input, context) {
    var _a, _b, _c, _d;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((_d = ((_c = ((_b = input === null || input === void 0 ? void 0 : input.company) === null || _b === void 0 ? void 0 : _b.users)) === null || _c === void 0 ? void 0 : _c.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _d !== void 0 ? _d : false)) {
        return true;
    }
    return false;
}
function Category_update(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { company: { users: { some: (user == null) ? { OR: [] } : { user: { is: { id: user.id } } } } } };
}
function $check_Category_update(input, context) {
    var _a, _b, _c, _d;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((_d = ((_c = ((_b = input === null || input === void 0 ? void 0 : input.company) === null || _b === void 0 ? void 0 : _b.users)) === null || _c === void 0 ? void 0 : _c.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _d !== void 0 ? _d : false)) {
        return true;
    }
    return false;
}
function Category_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Category_postUpdate(input, context) {
    return true;
}
function Category_delete(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { company: { users: { some: (user == null) ? { OR: [] } : { user: { is: { id: user.id } } } } } };
}
function $check_Category_delete(input, context) {
    var _a, _b, _c, _d;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((_d = ((_c = ((_b = input === null || input === void 0 ? void 0 : input.company) === null || _b === void 0 ? void 0 : _b.users)) === null || _c === void 0 ? void 0 : _c.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _d !== void 0 ? _d : false)) {
        return true;
    }
    return false;
}
function Subcategory_read(context, db) {
    return { AND: [] };
}
function $check_Subcategory_read(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Subcategory_create(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { company: { users: { some: (user == null) ? { OR: [] } : { user: { is: { id: user.id } } } } } };
}
function $check_Subcategory_create(input, context) {
    var _a, _b, _c, _d;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((_d = ((_c = ((_b = input === null || input === void 0 ? void 0 : input.company) === null || _b === void 0 ? void 0 : _b.users)) === null || _c === void 0 ? void 0 : _c.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _d !== void 0 ? _d : false)) {
        return true;
    }
    return false;
}
function Subcategory_update(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { company: { users: { some: (user == null) ? { OR: [] } : { user: { is: { id: user.id } } } } } };
}
function $check_Subcategory_update(input, context) {
    var _a, _b, _c, _d;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((_d = ((_c = ((_b = input === null || input === void 0 ? void 0 : input.company) === null || _b === void 0 ? void 0 : _b.users)) === null || _c === void 0 ? void 0 : _c.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _d !== void 0 ? _d : false)) {
        return true;
    }
    return false;
}
function Subcategory_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Subcategory_postUpdate(input, context) {
    return true;
}
function Subcategory_delete(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { company: { users: { some: (user == null) ? { OR: [] } : { user: { is: { id: user.id } } } } } };
}
function $check_Subcategory_delete(input, context) {
    var _a, _b, _c, _d;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((_d = ((_c = ((_b = input === null || input === void 0 ? void 0 : input.company) === null || _b === void 0 ? void 0 : _b.users)) === null || _c === void 0 ? void 0 : _c.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _d !== void 0 ? _d : false)) {
        return true;
    }
    return false;
}
function Product_read(context, db) {
    return { AND: [] };
}
function $check_Product_read(input, context) {
    var _a, _b, _c, _d;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (true) {
        return true;
    }
    if (((_d = ((_c = ((_b = input === null || input === void 0 ? void 0 : input.company) === null || _b === void 0 ? void 0 : _b.users)) === null || _c === void 0 ? void 0 : _c.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _d !== void 0 ? _d : false)) {
        return true;
    }
    return false;
}
function Product_create(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { company: { users: { some: (user == null) ? { OR: [] } : { user: { is: { id: user.id } } } } } };
}
function $check_Product_create(input, context) {
    var _a, _b, _c, _d;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((_d = ((_c = ((_b = input === null || input === void 0 ? void 0 : input.company) === null || _b === void 0 ? void 0 : _b.users)) === null || _c === void 0 ? void 0 : _c.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _d !== void 0 ? _d : false)) {
        return true;
    }
    return false;
}
function Product_update(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { company: { users: { some: (user == null) ? { OR: [] } : { user: { is: { id: user.id } } } } } };
}
function $check_Product_update(input, context) {
    var _a, _b, _c, _d;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((_d = ((_c = ((_b = input === null || input === void 0 ? void 0 : input.company) === null || _b === void 0 ? void 0 : _b.users)) === null || _c === void 0 ? void 0 : _c.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _d !== void 0 ? _d : false)) {
        return true;
    }
    return false;
}
function Product_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Product_postUpdate(input, context) {
    return true;
}
function Product_delete(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { company: { users: { some: (user == null) ? { OR: [] } : { user: { is: { id: user.id } } } } } };
}
function $check_Product_delete(input, context) {
    var _a, _b, _c, _d;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((_d = ((_c = ((_b = input === null || input === void 0 ? void 0 : input.company) === null || _b === void 0 ? void 0 : _b.users)) === null || _c === void 0 ? void 0 : _c.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _d !== void 0 ? _d : false)) {
        return true;
    }
    return false;
}
function Variant_read(context, db) {
    return { AND: [] };
}
function $check_Variant_read(input, context) {
    var _a, _b, _c, _d, _e;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (true) {
        return true;
    }
    if (((_e = ((_d = ((_c = (_b = input === null || input === void 0 ? void 0 : input.product) === null || _b === void 0 ? void 0 : _b.company) === null || _c === void 0 ? void 0 : _c.users)) === null || _d === void 0 ? void 0 : _d.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _e !== void 0 ? _e : false)) {
        return true;
    }
    return false;
}
function Variant_create(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { product: { company: { users: { some: (user == null) ? { OR: [] } : { user: { is: { id: user.id } } } } } } };
}
function $check_Variant_create(input, context) {
    var _a, _b, _c, _d, _e;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((_e = ((_d = ((_c = (_b = input === null || input === void 0 ? void 0 : input.product) === null || _b === void 0 ? void 0 : _b.company) === null || _c === void 0 ? void 0 : _c.users)) === null || _d === void 0 ? void 0 : _d.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _e !== void 0 ? _e : false)) {
        return true;
    }
    return false;
}
function Variant_update(context, db) {
    return { AND: [] };
}
function $check_Variant_update(input, context) {
    var _a, _b, _c, _d, _e;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (true) {
        return true;
    }
    if (((_e = ((_d = ((_c = (_b = input === null || input === void 0 ? void 0 : input.product) === null || _b === void 0 ? void 0 : _b.company) === null || _c === void 0 ? void 0 : _c.users)) === null || _d === void 0 ? void 0 : _d.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _e !== void 0 ? _e : false)) {
        return true;
    }
    return false;
}
function Variant_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Variant_postUpdate(input, context) {
    return true;
}
function Variant_delete(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return { product: { company: { users: { some: (user == null) ? { OR: [] } : { user: { is: { id: user.id } } } } } } };
}
function $check_Variant_delete(input, context) {
    var _a, _b, _c, _d, _e;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((_e = ((_d = ((_c = (_b = input === null || input === void 0 ? void 0 : input.product) === null || _b === void 0 ? void 0 : _b.company) === null || _c === void 0 ? void 0 : _c.users)) === null || _d === void 0 ? void 0 : _d.some((_item) => { var _a, _b, _c; return (((_b = (_a = _item === null || _item === void 0 ? void 0 : _item.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null) == ((_c = user === null || user === void 0 ? void 0 : user.id) !== null && _c !== void 0 ? _c : null)); }))) !== null && _e !== void 0 ? _e : false)) {
        return true;
    }
    return false;
}
function Item_read(context, db) {
    return { AND: [] };
}
function $check_Item_read(input, context) {
    if (true) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Item_create(context, db) {
    return { AND: [] };
}
function $check_Item_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Item_create_input(input, context) {
    return true;
}
function Item_update(context, db) {
    return { AND: [] };
}
function $check_Item_update(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Item_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Item_postUpdate(input, context) {
    return true;
}
function Item_delete(context, db) {
    return { OR: [] };
}
function $check_Item_delete(input, context) {
    return false;
}
function PurchaseOrder_read(context, db) {
    return { AND: [] };
}
function $check_PurchaseOrder_read(input, context) {
    if (true) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function PurchaseOrder_create(context, db) {
    return { AND: [] };
}
function $check_PurchaseOrder_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function PurchaseOrder_create_input(input, context) {
    return true;
}
function PurchaseOrder_update(context, db) {
    return { AND: [] };
}
function $check_PurchaseOrder_update(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function PurchaseOrder_postUpdate(context, db) {
    return { AND: [] };
}
function $check_PurchaseOrder_postUpdate(input, context) {
    return true;
}
function PurchaseOrder_delete(context, db) {
    return { OR: [] };
}
function $check_PurchaseOrder_delete(input, context) {
    return false;
}
function Bill_read(context, db) {
    return { AND: [] };
}
function $check_Bill_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Bill_create(context, db) {
    return { AND: [] };
}
function $check_Bill_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Bill_create_input(input, context) {
    return true;
}
function Bill_update(context, db) {
    return { AND: [] };
}
function $check_Bill_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Bill_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Bill_postUpdate(input, context) {
    return true;
}
function Bill_delete(context, db) {
    return { AND: [] };
}
function $check_Bill_delete(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function TokenEntry_read(context, db) {
    return { AND: [] };
}
function $check_TokenEntry_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function TokenEntry_create(context, db) {
    return { AND: [] };
}
function $check_TokenEntry_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function TokenEntry_create_input(input, context) {
    return true;
}
function TokenEntry_update(context, db) {
    return { AND: [] };
}
function $check_TokenEntry_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function TokenEntry_postUpdate(context, db) {
    return { AND: [] };
}
function $check_TokenEntry_postUpdate(input, context) {
    return true;
}
function TokenEntry_delete(context, db) {
    return { AND: [] };
}
function $check_TokenEntry_delete(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Entry_read(context, db) {
    return { AND: [] };
}
function $check_Entry_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Entry_create(context, db) {
    return { AND: [] };
}
function $check_Entry_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Entry_create_input(input, context) {
    return true;
}
function Entry_update(context, db) {
    return { AND: [] };
}
function $check_Entry_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Entry_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Entry_postUpdate(input, context) {
    return true;
}
function Entry_delete(context, db) {
    return { AND: [] };
}
function $check_Entry_delete(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Account_read(context, db) {
    return { AND: [] };
}
function $check_Account_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Account_create(context, db) {
    return { AND: [] };
}
function $check_Account_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Account_create_input(input, context) {
    return true;
}
function Account_update(context, db) {
    return { AND: [] };
}
function $check_Account_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Account_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Account_postUpdate(input, context) {
    return true;
}
function Account_delete(context, db) {
    return { AND: [] };
}
function $check_Account_delete(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function ExpenseCategory_read(context, db) {
    return { AND: [] };
}
function $check_ExpenseCategory_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function ExpenseCategory_create(context, db) {
    return { AND: [] };
}
function $check_ExpenseCategory_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function ExpenseCategory_create_input(input, context) {
    return true;
}
function ExpenseCategory_update(context, db) {
    return { AND: [] };
}
function $check_ExpenseCategory_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function ExpenseCategory_postUpdate(context, db) {
    return { AND: [] };
}
function $check_ExpenseCategory_postUpdate(input, context) {
    return true;
}
function ExpenseCategory_delete(context, db) {
    return { AND: [] };
}
function $check_ExpenseCategory_delete(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Expense_read(context, db) {
    return { AND: [] };
}
function $check_Expense_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Expense_create(context, db) {
    return { AND: [] };
}
function $check_Expense_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Expense_create_input(input, context) {
    return true;
}
function Expense_update(context, db) {
    return { AND: [] };
}
function $check_Expense_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Expense_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Expense_postUpdate(input, context) {
    return true;
}
function Expense_delete(context, db) {
    return { AND: [] };
}
function $check_Expense_delete(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Payment_read(context, db) {
    return { AND: [] };
}
function $check_Payment_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Payment_create(context, db) {
    return { AND: [] };
}
function $check_Payment_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Payment_create_input(input, context) {
    return true;
}
function Payment_update(context, db) {
    return { AND: [] };
}
function $check_Payment_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Payment_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Payment_postUpdate(input, context) {
    return true;
}
function Payment_delete(context, db) {
    return { AND: [] };
}
function $check_Payment_delete(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Address_read(context, db) {
    return { AND: [] };
}
function $check_Address_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Address_create(context, db) {
    return { AND: [] };
}
function $check_Address_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Address_create_input(input, context) {
    return true;
}
function Address_update(context, db) {
    return { AND: [] };
}
function $check_Address_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function Address_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Address_postUpdate(input, context) {
    return true;
}
function Address_delete(context, db) {
    return { AND: [] };
}
function $check_Address_delete(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Conversation_read(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return { AND: [] };
    }
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_Conversation_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if ((user != null)) {
        return true;
    }
    return false;
}
function Conversation_create(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_Conversation_create(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function Conversation_create_input(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return (user != null);
}
function Conversation_update(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return { AND: [] };
    }
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_Conversation_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if ((user != null)) {
        return true;
    }
    return false;
}
function Conversation_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Conversation_postUpdate(input, context) {
    return true;
}
function Conversation_delete(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_Conversation_delete(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function Message_read(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return { AND: [] };
    }
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_Message_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if ((user != null)) {
        return true;
    }
    return false;
}
function Message_create(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_Message_create(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function Message_create_input(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return (user != null);
}
function Message_update(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return { AND: [] };
    }
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_Message_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if ((user != null)) {
        return true;
    }
    return false;
}
function Message_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Message_postUpdate(input, context) {
    return true;
}
function Message_delete(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_Message_delete(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function CompanyUser_read(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_CompanyUser_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function CompanyUser_create(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_CompanyUser_create(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function CompanyUser_create_input(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return (user != null);
}
function CompanyUser_update(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_CompanyUser_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function CompanyUser_postUpdate(context, db) {
    return { AND: [] };
}
function $check_CompanyUser_postUpdate(input, context) {
    return true;
}
function CompanyUser_delete(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_CompanyUser_delete(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function CompanyClient_read(context, db) {
    return { AND: [] };
}
function $check_CompanyClient_read(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function CompanyClient_create(context, db) {
    return { AND: [] };
}
function $check_CompanyClient_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function CompanyClient_create_input(input, context) {
    return true;
}
function CompanyClient_update(context, db) {
    return { AND: [] };
}
function $check_CompanyClient_update(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function CompanyClient_postUpdate(context, db) {
    return { AND: [] };
}
function $check_CompanyClient_postUpdate(input, context) {
    return true;
}
function CompanyClient_delete(context, db) {
    return { AND: [] };
}
function $check_CompanyClient_delete(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function UserConversation_read(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_UserConversation_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function UserConversation_create(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_UserConversation_create(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function UserConversation_create_input(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return (user != null);
}
function UserConversation_update(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_UserConversation_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function UserConversation_postUpdate(context, db) {
    return { AND: [] };
}
function $check_UserConversation_postUpdate(input, context) {
    return true;
}
function UserConversation_delete(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_UserConversation_delete(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function ClientConversation_read(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_ClientConversation_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function ClientConversation_create(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_ClientConversation_create(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function ClientConversation_create_input(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return (user != null);
}
function ClientConversation_update(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_ClientConversation_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function ClientConversation_postUpdate(context, db) {
    return { AND: [] };
}
function $check_ClientConversation_postUpdate(input, context) {
    return true;
}
function ClientConversation_delete(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_ClientConversation_delete(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function UserClient_read(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_UserClient_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function UserClient_create(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_UserClient_create(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function UserClient_create_input(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return (user != null);
}
function UserClient_update(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_UserClient_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function UserClient_postUpdate(context, db) {
    return { AND: [] };
}
function $check_UserClient_postUpdate(input, context) {
    return true;
}
function UserClient_delete(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_UserClient_delete(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function DistributorCompany_read(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_DistributorCompany_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function DistributorCompany_create(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_DistributorCompany_create(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function DistributorCompany_create_input(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    return (user != null);
}
function DistributorCompany_update(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_DistributorCompany_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function DistributorCompany_postUpdate(context, db) {
    return { AND: [] };
}
function $check_DistributorCompany_postUpdate(input, context) {
    return true;
}
function DistributorCompany_delete(context, db) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return { AND: [] };
    }
    return { OR: [] };
}
function $check_DistributorCompany_delete(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if ((user != null)) {
        return true;
    }
    return false;
}
function VariantSizeBarcode_read(context, db) {
    return { AND: [] };
}
function $check_VariantSizeBarcode_read(input, context) {
    if (true) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function VariantSizeBarcode_create(context, db) {
    return { AND: [] };
}
function $check_VariantSizeBarcode_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function VariantSizeBarcode_create_input(input, context) {
    return true;
}
function VariantSizeBarcode_update(context, db) {
    return { AND: [] };
}
function $check_VariantSizeBarcode_update(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function VariantSizeBarcode_postUpdate(context, db) {
    return { AND: [] };
}
function $check_VariantSizeBarcode_postUpdate(input, context) {
    return true;
}
function VariantSizeBarcode_delete(context, db) {
    return { OR: [] };
}
function $check_VariantSizeBarcode_delete(input, context) {
    return false;
}
function EmailOtp_read(context, db) {
    return { AND: [] };
}
function $check_EmailOtp_read(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function EmailOtp_create(context, db) {
    return { AND: [] };
}
function $check_EmailOtp_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function EmailOtp_create_input(input, context) {
    return true;
}
function EmailOtp_update(context, db) {
    return { AND: [] };
}
function $check_EmailOtp_update(input, context) {
    var _a;
    const user = (_a = context.user) !== null && _a !== void 0 ? _a : null;
    if (((user === null || user === void 0 ? void 0 : user.role) == 'admin')) {
        return true;
    }
    if (true) {
        return true;
    }
    return false;
}
function EmailOtp_postUpdate(context, db) {
    return { AND: [] };
}
function $check_EmailOtp_postUpdate(input, context) {
    return true;
}
function EmailOtp_delete(context, db) {
    return { AND: [] };
}
function $check_EmailOtp_delete(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Notification_read(context, db) {
    return { AND: [] };
}
function $check_Notification_read(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Notification_create(context, db) {
    return { AND: [] };
}
function $check_Notification_create(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Notification_create_input(input, context) {
    return true;
}
function Notification_update(context, db) {
    return { AND: [] };
}
function $check_Notification_update(input, context) {
    if (true) {
        return true;
    }
    return false;
}
function Notification_postUpdate(context, db) {
    return { AND: [] };
}
function $check_Notification_postUpdate(input, context) {
    return true;
}
function Notification_delete(context, db) {
    return { AND: [] };
}
function $check_Notification_delete(input, context) {
    if (true) {
        return true;
    }
    return false;
}
exports.default = policy;
