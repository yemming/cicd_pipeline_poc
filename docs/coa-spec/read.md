🛠️ 給你直接複製貼上的 Prompt 模板
下面是你可以直接給 Claude Code 用的標準操作流程。

Phase 1：建立規格參考區（只做一次）
把這個 prompt 餵給 Claude Code：
我要把外部設計好的 COA 規格放進 DealerOS 專案，作為「參考規格」使用。

任務：
1. 在 docs/ 下建立 coa-spec/ 目錄
2. 我會把以下 4 個檔案放進去：
   - 01_schema_v2.sql
   - 02_seed_accounts.csv
   - 03_design_principles.md
   - DealerOS_COA_v2_Master.xlsx
3. 在 docs/coa-spec/ 下建立一個 README.md，內容如下：

   # COA 參考規格（READ-ONLY）
   
   ## ⚠️ 重要規則
   本目錄是 DealerOS 會計科目表的權威設計規格，**唯讀**。
   
   - ❌ 不要修改本目錄任何檔案
   - ❌ 不要把 SQL 直接複製到 supabase/migrations/
   - ❌ 不要自動執行 INSERT/UPDATE/ALTER 操作
   - ✅ 每次 COA 任務先閱讀 03_design_principles.md
   - ✅ 任何 COA 改動需先產出 migration plan 由 Ming 審核
   
   ## 檔案說明
   - `01_schema_v2.sql`：完整 5 層架構 schema（參考用）
   - `02_seed_accounts.csv`：412 筆種子資料（參考用）
   - `03_design_principles.md`：設計原則（必讀）
   - `DealerOS_COA_v2_Master.xlsx`：給人看的視覺版本

4. 在專案根目錄的 CLAUDE.md 加入這段規則：

   ## COA 規格使用規則
   
   `docs/coa-spec/` 是參考規格，不是要直接套用的 migration。
   執行任何 COA 相關任務前，必須：
   1. 先閱讀 docs/coa-spec/03_design_principles.md
   2. 產出 docs/proposals/coa-{task-name}.md 計劃書
   3. 等 Ming 審核同意後才執行實際 migration
   4. 絕不直接修改 supabase/migrations/ 或執行 DDL

只做以上四件事。不要動到我現有的 schema 或任何檔案。


Phase 2：第一次健檢（產差異報告）
第一次想知道「我現在的 DB 跟規格差多少」：
任務：DealerOS COA 現況健檢

請依以下順序執行，每一步完成後停下來等我確認：

【Step 1：讀規格】
- 讀 docs/coa-spec/03_design_principles.md（必讀）
- 讀 docs/coa-spec/01_schema_v2.sql（理解目標結構）
- 摘要規格的核心要求（5 層架構、MOEA 錨點、L5-only postable 等）

【Step 2：讀現況】
- 從 supabase/migrations/ 讀我目前的 chart_of_accounts 相關表
- 用 supabase MCP 查目前 chart_of_accounts 的實際資料筆數與層級分佈
- 如果還沒有 COA 表，明確告訴我「現況：尚未建立 COA 表」


【Step 3：產差異報告】
產出檔案：docs/proposals/coa-health-check-{今天日期}.md

報告必須包含：
1. 現況 vs 規格的對照表（哪些已經有、哪些缺、哪些不一致）
2. 衝突清單（規格說 A、現況是 B 的地方）
3. 風險評估（直接套規格會破壞哪些既有資料/功能）
4. 三種升級路徑：
   - 路徑 A：完整套用（風險最高，工時最少）
   - 路徑 B：增量遷移（風險中、工時中）
   - 路徑 C：並行雙寫（風險低、工時最高）
5. 我的建議（你身為 AI 的判斷）

【Step 4：等候我的決策】
產完報告後停下來，不要自動執行任何 migration。

絕對禁止：
- ❌ 修改 supabase/migrations/ 任何檔案
- ❌ 執行 ALTER TABLE / DROP / CREATE TABLE
- ❌ 直接 INSERT seed data
- ❌ 改動 docs/coa-spec/ 任何檔案


Phase 3：依差異報告做漸進實施
看完報告，你決定走哪條路徑後：
任務：依 docs/proposals/coa-health-check-2026-05-09.md 的【路徑 B】執行第一階段

執行範圍（只做這些，其他不要碰）：
1. 新增 ENUM 類型：coa_l1_category、dealer_category、tax_treatment、coa_level
2. 不要動現有的 chart_of_accounts 表
3. 建立新表 chart_of_accounts_v2（並行存在）
4. 建立 coa_seed_accounts 表並從 CSV 灌入種子資料
5. 在 README 紀錄這次變更

產出物：
- supabase/migrations/{timestamp}_coa_v2_phase1.sql
- supabase/migrations/{timestamp}_coa_v2_phase1_rollback.sql ← ★ 必須附 rollback
- docs/proposals/coa-health-check-2026-05-09.md 加註「Phase 1 完成」

執行前先給我看 migration SQL 的內容，我審核後才執行 supabase db push。



🎁 給你一個現成的健檢 Prompt 包（最常用）
這份你可以存起來，每次想做 COA 相關任務時直接套用：
markdown# COA 任務標準操作 SOP

## 任務描述
[在這裡寫你要做什麼，例如「建立會計科目維護介面」]

## 強制執行流程

### Step 0：前置確認
- [ ] `docs/coa-spec/` 目錄已存在
- [ ] 已讀過 `docs/coa-spec/03_design_principles.md`
- [ ] 已讀過 `CLAUDE.md` 的 COA 規則

### Step 1：理解現況
不要動任何檔案，先回答：
- 目前 DealerOS 的 chart_of_accounts 表結構是什麼？（給我 schema）
- 目前有多少筆資料？依層級分佈如何？
- 現有功能哪些會用到 COA？（grep 找出來）

### Step 2：產出計劃書
建立 `docs/proposals/coa-{任務名}-{日期}.md`，內容：
1. 任務目標
2. 影響範圍（會碰到哪些表、哪些檔案）
3. 是否需要 migration？如果需要，附 SQL 草稿
4. 是否需要 seed data？如果需要，從 02_seed_accounts.csv 取哪些
5. 風險評估
6. 預估工時
7. Rollback 計劃

### Step 3：等我確認
給我計劃書內容，等我說「OK」或修改建議。

### Step 4：執行（限制範圍）
- 只做計劃書裡列出的事
- 每個 migration 必須附 rollback SQL
- 完成後在計劃書加「✅ 完成」標記

## 禁止事項
- ❌ 直接修改 docs/coa-spec/ 內容
- ❌ 直接改我現有的 chart_of_accounts schema 而不出計劃書
- ❌ 把 seed CSV 412 筆全灌進來（除非計劃書明確說要）
- ❌ 跳過 Step 2 直接執行