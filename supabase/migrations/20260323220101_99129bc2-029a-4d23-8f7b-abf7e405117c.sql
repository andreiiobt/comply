
-- Move Roman's profile to Esca
UPDATE profiles SET company_id = 'd2fc1464-e4f4-4c43-9a1a-158b6ef01437' WHERE user_id = '2d6b9195-b151-4148-b02f-c482862acdbf';

-- Move Roman's user_role to Esca
UPDATE user_roles SET company_id = 'd2fc1464-e4f4-4c43-9a1a-158b6ef01437' WHERE user_id = '2d6b9195-b151-4148-b02f-c482862acdbf';

-- Move HRIS integration to Esca
UPDATE hris_integrations SET company_id = 'd2fc1464-e4f4-4c43-9a1a-158b6ef01437' WHERE id = 'b5e716a9-6975-4628-b3ca-87ededb19a28';
