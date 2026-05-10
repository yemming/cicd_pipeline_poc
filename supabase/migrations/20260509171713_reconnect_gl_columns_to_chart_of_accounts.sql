-- customers: gl_receivable
ALTER TABLE customers RENAME COLUMN gl_receivable_account_id TO gl_receivable_coa_id;
ALTER TABLE customers ADD CONSTRAINT customers_gl_receivable_coa_id_fkey
  FOREIGN KEY (gl_receivable_coa_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

-- suppliers: gl_payable
ALTER TABLE suppliers RENAME COLUMN gl_payable_account_id TO gl_payable_coa_id;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_gl_payable_coa_id_fkey
  FOREIGN KEY (gl_payable_coa_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

-- items: 3 columns (inventory / cogs / revenue)
ALTER TABLE items RENAME COLUMN gl_inventory_account_id TO gl_inventory_coa_id;
ALTER TABLE items RENAME COLUMN gl_cogs_account_id TO gl_cogs_coa_id;
ALTER TABLE items RENAME COLUMN gl_revenue_account_id TO gl_revenue_coa_id;
ALTER TABLE items ADD CONSTRAINT items_gl_inventory_coa_id_fkey
  FOREIGN KEY (gl_inventory_coa_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE items ADD CONSTRAINT items_gl_cogs_coa_id_fkey
  FOREIGN KEY (gl_cogs_coa_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE items ADD CONSTRAINT items_gl_revenue_coa_id_fkey
  FOREIGN KEY (gl_revenue_coa_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
