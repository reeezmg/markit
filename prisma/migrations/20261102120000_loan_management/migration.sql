-- PREPARED ONLY. Apply only after a separate explicit database instruction.
CREATE TABLE accountant_v2_loans (
 id text PRIMARY KEY, company_id text NOT NULL REFERENCES companies(id),
 investor_id text NOT NULL, name text NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','OPEN','CLOSED','CANCELLED')),
 currency text NOT NULL, terms jsonb NOT NULL, accounts jsonb NOT NULL, schedule jsonb NOT NULL,
 created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(company_id,id),
 FOREIGN KEY(company_id,investor_id) REFERENCES accountant_v2_investors(company_id,id)
);
CREATE INDEX accountant_v2_loans_company_id_status_idx ON accountant_v2_loans(company_id,status);
CREATE TABLE accountant_v2_loan_events (
 id text PRIMARY KEY, company_id text NOT NULL, loan_id text NOT NULL, event_date date NOT NULL,
 kind text NOT NULL CHECK(kind IN ('RECEIPT','INSTALMENT','RECLASS','RECLASS_REVERSAL','PAYMENT','SETTLEMENT','PAYMENT_REVERSAL')),
 principal numeric(16,2) NOT NULL DEFAULT 0 CHECK(principal>=0),
 interest numeric(16,2) NOT NULL DEFAULT 0 CHECK(interest>=0),
 fees numeric(16,2) NOT NULL DEFAULT 0 CHECK(fees>=0),
 journal_id text NOT NULL, request_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}',
 created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(company_id,request_id),
 FOREIGN KEY(company_id,loan_id) REFERENCES accountant_v2_loans(company_id,id)
);
CREATE INDEX accountant_v2_loan_events_company_id_loan_id_event_date_idx ON accountant_v2_loan_events(company_id,loan_id,event_date);
