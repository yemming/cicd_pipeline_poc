-- Step 1: 清 dummy warehouses 的 RESTRICT 下游（CASCADE 部分自動處理）
DELETE FROM stock_items WHERE warehouse_id IN (
  '8e7220a2-fbfd-4252-3064-12345a61f8a5',
  '8c4a3f24-0167-2884-e96f-a7c027782294',
  '497daa56-504f-763c-6d34-9e023fe5b3e3',
  '1e5c889e-ec76-f322-d9d2-997e54780a8f',
  '74549504-ddcc-20f9-16b7-7b7a102e4e2e'
);
DELETE FROM consignment_stocks WHERE warehouse_id IN (
  '8e7220a2-fbfd-4252-3064-12345a61f8a5',
  '8c4a3f24-0167-2884-e96f-a7c027782294',
  '497daa56-504f-763c-6d34-9e023fe5b3e3',
  '1e5c889e-ec76-f322-d9d2-997e54780a8f',
  '74549504-ddcc-20f9-16b7-7b7a102e4e2e'
);
DELETE FROM stock_transfers WHERE source_warehouse_id IN (
  '8e7220a2-fbfd-4252-3064-12345a61f8a5',
  '8c4a3f24-0167-2884-e96f-a7c027782294',
  '497daa56-504f-763c-6d34-9e023fe5b3e3',
  '1e5c889e-ec76-f322-d9d2-997e54780a8f',
  '74549504-ddcc-20f9-16b7-7b7a102e4e2e'
) OR target_warehouse_id IN (
  '8e7220a2-fbfd-4252-3064-12345a61f8a5',
  '8c4a3f24-0167-2884-e96f-a7c027782294',
  '497daa56-504f-763c-6d34-9e023fe5b3e3',
  '1e5c889e-ec76-f322-d9d2-997e54780a8f',
  '74549504-ddcc-20f9-16b7-7b7a102e4e2e'
);
DELETE FROM stock_issues WHERE warehouse_id IN (
  '8e7220a2-fbfd-4252-3064-12345a61f8a5',
  '8c4a3f24-0167-2884-e96f-a7c027782294',
  '497daa56-504f-763c-6d34-9e023fe5b3e3',
  '1e5c889e-ec76-f322-d9d2-997e54780a8f',
  '74549504-ddcc-20f9-16b7-7b7a102e4e2e'
);
DELETE FROM stock_receipts WHERE warehouse_id IN (
  '8e7220a2-fbfd-4252-3064-12345a61f8a5',
  '8c4a3f24-0167-2884-e96f-a7c027782294',
  '497daa56-504f-763c-6d34-9e023fe5b3e3',
  '1e5c889e-ec76-f322-d9d2-997e54780a8f',
  '74549504-ddcc-20f9-16b7-7b7a102e4e2e'
);
DELETE FROM inventory_adjustments WHERE warehouse_id IN (
  '8e7220a2-fbfd-4252-3064-12345a61f8a5',
  '8c4a3f24-0167-2884-e96f-a7c027782294',
  '497daa56-504f-763c-6d34-9e023fe5b3e3',
  '1e5c889e-ec76-f322-d9d2-997e54780a8f',
  '74549504-ddcc-20f9-16b7-7b7a102e4e2e'
);
DELETE FROM inventory_counts WHERE warehouse_id IN (
  '8e7220a2-fbfd-4252-3064-12345a61f8a5',
  '8c4a3f24-0167-2884-e96f-a7c027782294',
  '497daa56-504f-763c-6d34-9e023fe5b3e3',
  '1e5c889e-ec76-f322-d9d2-997e54780a8f',
  '74549504-ddcc-20f9-16b7-7b7a102e4e2e'
);
DELETE FROM inventory_count_plans WHERE warehouse_id IN (
  '8e7220a2-fbfd-4252-3064-12345a61f8a5',
  '8c4a3f24-0167-2884-e96f-a7c027782294',
  '497daa56-504f-763c-6d34-9e023fe5b3e3',
  '1e5c889e-ec76-f322-d9d2-997e54780a8f',
  '74549504-ddcc-20f9-16b7-7b7a102e4e2e'
);

-- Step 2: 清 dummy warehouses（CASCADE 自動清 zones/bins/slots/thresholds/abc/replenishment_policies）
DELETE FROM warehouses WHERE org_id IN (
  '5d845f00-ebce-44ae-815a-91968f0b7a1e',
  '478218c7-2824-7c8e-bd2b-423d9911b1ca',
  'b58af2aa-2a5a-9c31-2fe1-0caad927a729',
  '0528510f-b0d6-59cb-be92-6dc16011f6bf',
  '6b8b1908-6bd5-2568-daf8-6db0b0dde2aa'
);

-- Step 3: organizations 其他直接相依
DELETE FROM item_store_prices WHERE org_id IN (
  '5d845f00-ebce-44ae-815a-91968f0b7a1e',
  '478218c7-2824-7c8e-bd2b-423d9911b1ca',
  'b58af2aa-2a5a-9c31-2fe1-0caad927a729',
  '0528510f-b0d6-59cb-be92-6dc16011f6bf',
  '6b8b1908-6bd5-2568-daf8-6db0b0dde2aa'
);
DELETE FROM purchase_requisitions WHERE org_id IN (
  '5d845f00-ebce-44ae-815a-91968f0b7a1e',
  '478218c7-2824-7c8e-bd2b-423d9911b1ca',
  'b58af2aa-2a5a-9c31-2fe1-0caad927a729',
  '0528510f-b0d6-59cb-be92-6dc16011f6bf',
  '6b8b1908-6bd5-2568-daf8-6db0b0dde2aa'
);
DELETE FROM purchase_permission_rules WHERE store_id IN (
  '5d845f00-ebce-44ae-815a-91968f0b7a1e',
  '478218c7-2824-7c8e-bd2b-423d9911b1ca',
  'b58af2aa-2a5a-9c31-2fe1-0caad927a729',
  '0528510f-b0d6-59cb-be92-6dc16011f6bf',
  '6b8b1908-6bd5-2568-daf8-6db0b0dde2aa'
);
DELETE FROM store_brands WHERE store_id IN (
  '5d845f00-ebce-44ae-815a-91968f0b7a1e',
  '478218c7-2824-7c8e-bd2b-423d9911b1ca',
  'b58af2aa-2a5a-9c31-2fe1-0caad927a729',
  '0528510f-b0d6-59cb-be92-6dc16011f6bf',
  '6b8b1908-6bd5-2568-daf8-6db0b0dde2aa'
);

-- Step 4: 先刪 stores（level=2），再刪 regions（level=1）— self-FK ordering
DELETE FROM organizations WHERE id IN (
  'b58af2aa-2a5a-9c31-2fe1-0caad927a729',
  '0528510f-b0d6-59cb-be92-6dc16011f6bf',
  '6b8b1908-6bd5-2568-daf8-6db0b0dde2aa'
);
DELETE FROM organizations WHERE id IN (
  '5d845f00-ebce-44ae-815a-91968f0b7a1e',
  '478218c7-2824-7c8e-bd2b-423d9911b1ca'
);

-- Step 5: UPDATE Ducati 部 placeholder → 真實「彥明國際貿易有限公司」(60373106)
UPDATE subsidiaries
SET legal_name = '彥明國際貿易有限公司',
    tax_id = '60373106',
    updated_at = now()
WHERE id = '8236672c-7e13-4fed-b60c-12a2afb85155';

-- Step 6: DELETE Indian 部 placeholder subsidiary（沒人指了）
DELETE FROM subsidiaries WHERE id = 'a537ec7e-8e09-4fd0-bad4-5a8324f8b2a4';
