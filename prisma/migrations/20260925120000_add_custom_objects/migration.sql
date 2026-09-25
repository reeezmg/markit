-- Virtual, company-scoped objects and typed values for storefront extensions.
CREATE TABLE custom_objects (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    slug text NOT NULL,
    name text NOT NULL,
    created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT custom_objects_company_slug_key UNIQUE (company_id, slug),
    CONSTRAINT custom_objects_company_id_id_key UNIQUE (company_id, id)
);

CREATE TABLE custom_fields (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id text NOT NULL,
    object_id text NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    value_type text NOT NULL,
    required boolean NOT NULL DEFAULT false,
    created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT custom_fields_object_fkey FOREIGN KEY (company_id, object_id)
        REFERENCES custom_objects(company_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT custom_fields_company_object_key_key UNIQUE (company_id, object_id, key),
    CONSTRAINT custom_fields_company_object_id_key UNIQUE (company_id, object_id, id),
    CONSTRAINT custom_fields_type_check CHECK (value_type IN ('TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'REFERENCE'))
);

CREATE TABLE custom_records (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id text NOT NULL,
    object_id text NOT NULL,
    created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT custom_records_object_fkey FOREIGN KEY (company_id, object_id)
        REFERENCES custom_objects(company_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT custom_records_company_object_id_key UNIQUE (company_id, object_id, id)
);
CREATE INDEX custom_records_company_object_created_idx
    ON custom_records(company_id, object_id, created_at);

CREATE TABLE custom_values (
    company_id text NOT NULL,
    object_id text NOT NULL,
    record_id text NOT NULL,
    field_id text NOT NULL,
    text_value text,
    number_value numeric(38, 10),
    boolean_value boolean,
    date_value date,
    timestamp_value timestamp(3),
    CONSTRAINT custom_values_pkey PRIMARY KEY (company_id, record_id, field_id),
    CONSTRAINT custom_values_record_fkey FOREIGN KEY (company_id, object_id, record_id)
        REFERENCES custom_records(company_id, object_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT custom_values_field_fkey FOREIGN KEY (company_id, object_id, field_id)
        REFERENCES custom_fields(company_id, object_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT custom_values_one_type_check CHECK (
        num_nonnulls(text_value, number_value, boolean_value, date_value, timestamp_value) = 1
    )
);
CREATE INDEX custom_values_text_lookup_idx ON custom_values(company_id, field_id, text_value);
CREATE INDEX custom_values_number_lookup_idx ON custom_values(company_id, field_id, number_value);
CREATE INDEX custom_values_date_lookup_idx ON custom_values(company_id, field_id, date_value);
CREATE INDEX custom_values_timestamp_lookup_idx ON custom_values(company_id, field_id, timestamp_value);

CREATE TABLE custom_relationships (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id text NOT NULL,
    source_object_id text NOT NULL,
    source_record_id text NOT NULL,
    field_id text NOT NULL,
    target_object_id text,
    target_record_id text,
    target_type text NOT NULL,
    target_id text NOT NULL,
    created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT custom_relationships_source_fkey FOREIGN KEY (company_id, source_object_id, source_record_id)
        REFERENCES custom_records(company_id, object_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT custom_relationships_field_fkey FOREIGN KEY (company_id, source_object_id, field_id)
        REFERENCES custom_fields(company_id, object_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT custom_relationships_target_fkey FOREIGN KEY (company_id, target_object_id, target_record_id)
        REFERENCES custom_records(company_id, object_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT custom_relationships_company_source_field_target_key
        UNIQUE (company_id, source_record_id, field_id, target_type, target_id),
    CONSTRAINT custom_relationships_target_shape_check CHECK (
        (target_type = 'CUSTOM' AND target_object_id IS NOT NULL AND target_record_id IS NOT NULL AND target_id = target_record_id)
        OR (target_type <> 'CUSTOM' AND target_object_id IS NULL AND target_record_id IS NULL)
    )
);
CREATE INDEX custom_relationships_target_lookup_idx
    ON custom_relationships(company_id, target_type, target_id);

-- Keep the chosen value column consistent with its field definition.
CREATE FUNCTION validate_custom_value_type() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE declared_type text;
BEGIN
    SELECT value_type INTO declared_type FROM custom_fields
    WHERE company_id = NEW.company_id AND object_id = NEW.object_id AND id = NEW.field_id;
    IF declared_type IS NULL OR NOT (
        (declared_type = 'TEXT' AND NEW.text_value IS NOT NULL) OR
        (declared_type = 'NUMBER' AND NEW.number_value IS NOT NULL) OR
        (declared_type = 'BOOLEAN' AND NEW.boolean_value IS NOT NULL) OR
        (declared_type = 'DATE' AND NEW.date_value IS NOT NULL) OR
        (declared_type = 'TIMESTAMP' AND NEW.timestamp_value IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'Custom value does not match field type';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER custom_values_type_guard
    BEFORE INSERT OR UPDATE ON custom_values
    FOR EACH ROW EXECUTE FUNCTION validate_custom_value_type();

CREATE FUNCTION validate_custom_relationship_field() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM custom_fields
        WHERE company_id = NEW.company_id AND object_id = NEW.source_object_id
          AND id = NEW.field_id AND value_type = 'REFERENCE'
    ) THEN
        RAISE EXCEPTION 'Custom relationship requires a REFERENCE field';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER custom_relationships_field_guard
    BEFORE INSERT OR UPDATE ON custom_relationships
    FOR EACH ROW EXECUTE FUNCTION validate_custom_relationship_field();

-- Changing a field's type must not silently invalidate its stored values or links.
CREATE FUNCTION guard_custom_field_type_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.value_type IS DISTINCT FROM OLD.value_type AND (
        EXISTS (SELECT 1 FROM custom_values WHERE company_id = OLD.company_id AND field_id = OLD.id)
        OR EXISTS (SELECT 1 FROM custom_relationships WHERE company_id = OLD.company_id AND field_id = OLD.id)
    ) THEN
        RAISE EXCEPTION 'Cannot change the type of a populated custom field';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER custom_fields_type_change_guard
    BEFORE UPDATE OF value_type ON custom_fields
    FOR EACH ROW EXECUTE FUNCTION guard_custom_field_type_change();
