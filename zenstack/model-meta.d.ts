declare const metadata: {
    models: {
        company: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                name: {
                    name: string;
                    type: string;
                };
                storecode: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    isAutoIncrement: boolean;
                };
                storeUniqueName: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                logo: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                description: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                shopifyStoreName: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                shopifyAccessToken: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                tiktokCipher: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                tiktokStoreName: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                tiktokAccessToken: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                tiktokAccessTokenExpireIn: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                tiktokRefreshToken: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                tiktokRefreshTokenExpireIn: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                images: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                isTaxIncluded: {
                    name: string;
                    type: string;
                    attributes: ({
                        name: string;
                        args: {
                            value: boolean;
                        }[];
                    } | {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    })[];
                };
                users: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                clients: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                products: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                categories: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                subcategories: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                bills: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                tokenbills: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                accounts: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                expenseCategories: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                expenses: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                payment: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                variants: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                purchaseOrders: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                items: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                status: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: boolean;
                        }[];
                    }[];
                };
                type: {
                    name: string;
                    type: string;
                };
                pipeline: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    backLink: string;
                };
                accHolderName: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                ifsc: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                accountNo: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                bankName: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                gstin: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                upiId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                notifications: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                address: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    backLink: string;
                };
                distributor: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                billCounter: {
                    name: string;
                    type: string;
                    attributes: ({
                        name: string;
                        args: {
                            value: number;
                        }[];
                    } | {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    })[];
                };
                barcodeCounter: {
                    name: string;
                    type: string;
                    attributes: ({
                        name: string;
                        args: {
                            value: number;
                        }[];
                    } | {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    })[];
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
                storecode: {
                    name: string;
                    fields: string[];
                };
                storeUniqueName: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        distributor: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                name: {
                    name: string;
                    type: string;
                };
                images: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                companies: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                purchaseorders: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                status: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: boolean;
                        }[];
                    }[];
                };
                accHolderName: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                ifsc: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                accountNo: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                bankName: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                gstin: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                address: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    backLink: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        user: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                email: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                name: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                password: {
                    name: string;
                    type: string;
                };
                status: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: boolean;
                        }[];
                    }[];
                };
                role: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                companies: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                address: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    backLink: string;
                };
                notifications: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                conversations: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                clients: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                image: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
                email: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        client: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                email: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                name: {
                    name: string;
                    type: string;
                };
                password: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                phone: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                status: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: boolean;
                        }[];
                    }[];
                };
                pipelineStatus: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                companies: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                address: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                bill: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    backLink: string;
                };
                conversations: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                users: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                newPipeline: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                newPipelineId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                prospectPipeline: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                prospectPipelineId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                viewingPipeline: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                viewingPipelineId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                rejectPipeline: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                rejectPipelineId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                closePipeline: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                closePipelineId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                notifications: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
                email: {
                    name: string;
                    fields: string[];
                };
                phone: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        pipeline: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                companyId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                newClients: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    backLink: string;
                };
                prospectClients: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    backLink: string;
                };
                viewingClients: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    backLink: string;
                };
                rejectClients: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    backLink: string;
                };
                closeClients: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    backLink: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
                companyId: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: {
                    value: string;
                }[];
            }[];
        };
        category: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                createdAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                updatedAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                name: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: number;
                        }[];
                    }[];
                };
                description: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                status: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: boolean;
                        }[];
                    }[];
                };
                image: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                companyId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                products: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                subcategories: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                entries: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                hsn: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                taxType: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                fixedTax: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                thresholdAmount: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                taxBelowThreshold: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                taxAboveThreshold: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        subcategory: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                createdAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                updatedAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                name: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: number;
                        }[];
                    }[];
                };
                description: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                status: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: boolean;
                        }[];
                    }[];
                };
                image: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                companyId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                products: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                category: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                categoryId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        product: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                createdAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                updatedAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                name: {
                    name: string;
                    type: string;
                };
                brand: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                status: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: boolean;
                        }[];
                    }[];
                };
                rating: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                description: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                companyId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                category: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                categoryId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                subcategory: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                subcategoryId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                variants: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                purchaseorder: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                purchaseorderId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        variant: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                createdAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                updatedAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                name: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: number;
                        }[];
                    }[];
                };
                code: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: number;
                        }[];
                    }[];
                };
                status: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: boolean;
                        }[];
                    }[];
                };
                sprice: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                pprice: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                qty: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                discount: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                dprice: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                sizes: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                images: {
                    name: string;
                    type: string;
                    isArray: boolean;
                };
                tax: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: number;
                        }[];
                    }[];
                };
                product: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                productId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                items: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                entries: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                companyId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                VariantSizeBarcode: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        item: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                barcode: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                createdAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                updatedAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                variant: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                variantId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                status: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                size: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                entry: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    backLink: string;
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                companyId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        purchaseOrder: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                createdAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                updatedAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                products: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                distributor: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                distributorId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                paymentType: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                companyId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        bill: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                createdAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                invoiceNumber: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                subtotal: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                discount: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                tax: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                grandTotal: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                deliveryFees: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                paymentMethod: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                paymentStatus: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                transactionId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                notes: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                type: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                status: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                deleted: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: boolean;
                        }[];
                    }[];
                };
                bookingDate: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                returnDeadline: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                entries: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                companyId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                account: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                accountId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                client: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                clientId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                address: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                addressId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
                transactionId: {
                    name: string;
                    fields: string[];
                };
                clientId: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        tokenEntry: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                createdAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                tokenNo: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                companyId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                itemId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                variantId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                barcode: {
                    name: string;
                    type: string;
                };
                categoryId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                size: {
                    name: string;
                    type: string;
                };
                name: {
                    name: string;
                    type: string;
                };
                qty: {
                    name: string;
                    type: string;
                };
                rate: {
                    name: string;
                    type: string;
                };
                discount: {
                    name: string;
                    type: string;
                };
                tax: {
                    name: string;
                    type: string;
                };
                value: {
                    name: string;
                    type: string;
                };
                sizes: {
                    name: string;
                    type: string;
                };
                totalQty: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        entry: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                name: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                barcode: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                qty: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                rate: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                discount: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                tax: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                value: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                size: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                variant: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                variantId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                outOfStock: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                category: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                categoryId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                bill: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                billId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                item: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                itemId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
                itemId: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        account: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                name: {
                    name: string;
                    type: string;
                };
                phone: {
                    name: string;
                    type: string;
                };
                bill: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                address: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    backLink: string;
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                companyId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        expenseCategory: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                name: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: number;
                        }[];
                    }[];
                };
                status: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: boolean;
                        }[];
                    }[];
                };
                createdAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                updatedAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                expenses: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                companyId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        expense: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                expenseDate: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                note: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: number;
                        }[];
                    }[];
                };
                currency: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                paymentMode: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                status: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                receipt: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                receiptName: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                taxAmount: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                totalAmount: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                createdAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                updatedAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                expensecategory: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                expensecategoryId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                companyId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        payment: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                paymentDate: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                paymentMode: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                paymentReference: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                amount: {
                    name: string;
                    type: string;
                };
                currency: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                status: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                createdAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                updatedAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                companyId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        address: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                createdAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                updatedAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                name: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                street: {
                    name: string;
                    type: string;
                };
                locality: {
                    name: string;
                    type: string;
                };
                city: {
                    name: string;
                    type: string;
                };
                state: {
                    name: string;
                    type: string;
                };
                pincode: {
                    name: string;
                    type: string;
                };
                active: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: boolean;
                        }[];
                    }[];
                };
                user: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                userId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                client: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                clientId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                distributor: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                distributorId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                companyId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                account: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                accountId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                bill: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
                userId: {
                    name: string;
                    fields: string[];
                };
                distributorId: {
                    name: string;
                    fields: string[];
                };
                companyId: {
                    name: string;
                    fields: string[];
                };
                accountId: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        conversation: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                createdAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                updatedAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                messages: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                users: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
                clients: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isArray: boolean;
                    backLink: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: {
                    value: string;
                }[];
            }[];
        };
        message: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                createdAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                updatedAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                conversationId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                conversation: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                senderId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                text: {
                    name: string;
                    type: string;
                };
                seen: {
                    name: string;
                    type: string;
                    isArray: boolean;
                };
                replyto: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                };
                edited: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: boolean;
                        }[];
                    }[];
                };
                deleted: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: boolean;
                        }[];
                    }[];
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: {
                    value: string;
                }[];
            }[];
        };
        companyUser: {
            name: string;
            fields: {
                companyId: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                userId: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                user: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
            };
            uniqueConstraints: {
                companyId_userId: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: {
                    value: string;
                }[];
            }[];
        };
        companyClient: {
            name: string;
            fields: {
                companyId: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                clientId: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                client: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
            };
            uniqueConstraints: {
                companyId_clientId: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        userConversation: {
            name: string;
            fields: {
                userId: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                conversationId: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                user: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                conversation: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
            };
            uniqueConstraints: {
                userId_conversationId: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: {
                    value: string;
                }[];
            }[];
        };
        clientConversation: {
            name: string;
            fields: {
                clientId: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                conversationId: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                client: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                conversation: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
            };
            uniqueConstraints: {
                clientId_conversationId: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: {
                    value: string;
                }[];
            }[];
        };
        userClient: {
            name: string;
            fields: {
                clientId: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                userId: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                client: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                user: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
            };
            uniqueConstraints: {
                clientId_userId: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: {
                    value: string;
                }[];
            }[];
        };
        distributorCompany: {
            name: string;
            fields: {
                distributorId: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                companyId: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                distributor: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
            };
            uniqueConstraints: {
                distributorId_companyId: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: {
                    value: string;
                }[];
            }[];
        };
        variantSizeBarcode: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    isAutoIncrement: boolean;
                };
                variantId: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                size: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                barcode: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                variant: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
                barcode: {
                    name: string;
                    fields: string[];
                };
                variantId_size: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        emailOtp: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                email: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                otp: {
                    name: string;
                    type: string;
                };
                expiresAt: {
                    name: string;
                    type: string;
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
                email: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
        notification: {
            name: string;
            fields: {
                id: {
                    name: string;
                    type: string;
                    isId: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                company: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                companyId: {
                    name: string;
                    type: string;
                    isForeignKey: boolean;
                    relationField: string;
                };
                user: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                userId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                clientId: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: {
                            value: string;
                        }[];
                    }[];
                    isForeignKey: boolean;
                    relationField: string;
                };
                client: {
                    name: string;
                    type: string;
                    isDataModel: boolean;
                    isOptional: boolean;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                    backLink: string;
                    isRelationOwner: boolean;
                    foreignKeyMapping: {
                        id: string;
                    };
                };
                type: {
                    name: string;
                    type: string;
                };
                title: {
                    name: string;
                    type: string;
                };
                message: {
                    name: string;
                    type: string;
                };
                read: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: {
                            value: boolean;
                        }[];
                    }[];
                };
                actionPath: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                metadata: {
                    name: string;
                    type: string;
                    isOptional: boolean;
                };
                createdAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
                updatedAt: {
                    name: string;
                    type: string;
                    attributes: {
                        name: string;
                        args: never[];
                    }[];
                };
            };
            uniqueConstraints: {
                id: {
                    name: string;
                    fields: string[];
                };
            };
            attributes: {
                name: string;
                args: ({
                    value: string;
                } | {
                    value: boolean;
                })[];
            }[];
        };
    };
    deleteCascade: {
        company: string[];
        product: string[];
        variant: string[];
        purchaseOrder: string[];
        bill: string[];
    };
    authModel: string;
};
export default metadata;
