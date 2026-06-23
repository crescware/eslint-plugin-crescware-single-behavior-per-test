# eslint-plugin-crescware-single-behavior-per-test 設計

## 0. このドキュメントの位置づけ

本書は 2026-06-21 の議事録「テストの複数 expect 問題と Heuristic Linting 構想」を一次資料とし、その思想を実装可能な仕様へ落としたものである。旧 DESIGN.md は基盤選定（typescript-eslint / RuleTester / tsup）を誤っていたため破棄した。本パッケージは前例（`eslint-plugin-crescware-no-inline-expected` 等）に倣い、oxlint の `jsPlugins` から読み込んで使う ESLint 互換プラグインとして実装する。

## 1. 何を解決するか

コーディングエージェント（Claude Code 等）が 1 つのテスト（`test()` / `it()`）に複数の `expect` を書く。口頭でも CLAUDE.md でも止まらない。文章には拘束力がなく無視できるからである。そこで、無視できない経路である lint に載せ、error で編集ループやビルドを物理的に落とす。これが拘束力になる。

ただし「複数 expect 禁止」だけ（例: `max-expects: 1`）では弱い。禁止のみで「代わりにどう書くか（出口）」を示さないと、読み手は最も安く error を消す回避策（expect を 1 個コメントアウトする等）へ最適化する。出口のない禁止は規範として機能しない。本プラグインは、この出口をエラーメッセージに同梱して弱点を埋める。

## 2. 中核思想：Heuristic Linting

本プラグインの新規性は機構（routing）ではなく、「ヒューリスティック性を lint のエラーメッセージとして受け入れた」点にある。要点は次のとおり。

- **lint は床（floor）である。** 選択肢の一つではない。lint が error で落ちること、これが拘束力の源泉であり全ての出発点。誘導（出口）は禁止のメッセージに乗る性質であって、禁止に代わるものではない。順序を取り違え、誘導を主役にした瞬間に CLAUDE.md と同じ「無視できる文章」へ戻る。
- **エラーメッセージ＝プロンプトである。** 今どき lint ログを読むのは人ではなくエージェント。ゆえにメッセージは「エージェントへの次の編集手順」を書く。CLAUDE.md と違い、(拘束力ある経路に)・(行動を起こす読み手へ)・(行動の瞬間に) 届く。
- **直す時刻を author-time から fix-time へ遅らせる。** 従来の lint は「ルール」と「どう直すか」が決定的なペアだった。本手法は、その対応が決まらない枝があることを前提に置く。each か split かを分ける情報（このテストの意図）はルール作成時に存在せず、修正時にいる読み手（意図を持つエージェント）にしか無いからである。決まらない枝では決定ではなく評価可能な基準を渡す。
- **決定不能点は「問い」を返して停止する。** 「test.each か分割か」は同一構造で意図のみが異なり、構文解析では原理的に決められない。ここでルールは答え（ラベル）を出さず、両候補と判断基準（問い）を返す。ただし開いているのは「どちらの出口で直すか」だけで、「直すか否か」は一切開いていない（依然 hard error）。
- **autofix は持たない。** 横着な部分検証（個別 expect の羅列）から網羅的 `toEqual` を機械的に復元することはできない（書かれていないフィールドは復元不能）。よって consolidate も「検出して停止、人/エージェントが完全な toEqual を書く」に留める。
- **前方互換。** ここで書く「AST パターン → プロンプト」は、将来 AST 層が重量指定の sub-agent へ dispatch するオーケストレータと同一物である。変わるのは実行先（場の Opus → 決定的 dispatch）だけで、作業は持ち越せる。本プラグインの所有物を「AST パターン → 出口プロンプト」に限定するのはこのため。

成立条件（議事録より）。(a) lint がエージェントの編集ループ内で回ること（CI のみは不可）。(b) メッセージが評価可能な基準を渡すこと（曖昧だと最も安い回避策に流れる）。(c) 決まらない枝では命令でなく確認を促すこと（誤った機械的修正の量産を防ぐ）。

## 3. 多用の 3 パターンと出口

核は「何が一定で、何が変化しているか（不変量の同定）」。出口は変化の所在で決まる。

1. **同一オブジェクトの複数フィールドを見ている** → 1 つの網羅的 `toEqual` に統合（consolidate、断定）。
2. **検証の間に状態を変えている／検証の形が揃っていない** → テストを分割（split、断定）。
3. **同じ操作の入力だけが違う** → `test.each` か分割か（each-or-split、問い）。

オブジェクト検証は `toEqual` のみを合法とする。`toMatchObject` 等の部分一致および個別 expect の羅列は禁止。部分一致は期待値に書いていないフィールドの増減を取りこぼし、検査として緩いからである。「全フィールドを書いた網羅的 `toEqual` 1 つ」だけが合法手になる。なお部分一致マッチャの実際の禁止は伴走者 `no-restricted-matchers`（利用者が別途有効化）に委ねる疎結合とし、本プラグインは bundle も hard-require もしない。`no-restricted-matchers` が無くても本ルールは禁止＋誘導として機能する（部分一致への逃げを文章で牽制するだけになる）。

## 4. Verdict 一覧

1 つのテストに対する判定結果を Verdict と呼ぶ。

| Verdict                  | トーン   | 意味                                                                                     |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------- |
| `consolidate`            | 断定     | 同一レシーバの別フィールドを個別 expect で見ている。網羅的 `toEqual` 1 つへ統合せよ。    |
| `split-by-act`           | 断定     | expect の間に状態変更（Act）が挟まる。Act を境界に test を分割せよ。                     |
| `split-by-heterogeneity` | 断定     | matcher / 被検証式の形が揃わない＝契約が複数。test を分割せよ。                          |
| `each-or-split`          | 問い     | 同一操作の入力違い。`test.each` か分割か。両候補と判断基準を提示する。                   |
| `loop-each`              | 断定     | ループ／反復コールバック内で検証している＝手書きパラメータ化。`test.each` に書き換えよ。 |
| `generic`                | 問い     | 出口を名指しできないとき。禁止は維持し、4 枝の判定順を自己診断チェックリストとして渡す。 |
| `abstain`                | （沈黙） | direct expect が 0〜1。違反でない。唯一沈黙してよいケース。                              |

abstain は「禁止しない」ではなく「違反が無い」の意味に限定する。出口を名指しできないケース（computed matcher 等）は沈黙ではなく `generic`（禁止＋汎用診断）へフォールバックする。禁止（error）は必ず維持し、誤検出回避は「分類の断定」にのみ効かせ、禁止そのものには効かせない。

## 5. 検出の母集団：direct expect

分類・報告の母集団は **direct expect** に限定する。direct expect とは、テストコールバック本体の `BlockStatement` 直下の `ExpressionStatement` に書かれた `expect` 連鎖である。

ただし例外が 1 つある。**ループ（`for` / `for-of` / `for-in` / `while` / `do-while`）または反復メソッドのコールバック（`forEach` / `map` 等）の中に `expect` が入っている場合**は、direct expect の個数に関わらず `loop-each` として扱い `test.each` へ誘導する。これは「同一ロジックを入力違いで回す手書きパラメータ化」（議事録パターン 1）であり、ループは原理的に各反復で同一の本体を走らせるため、各反復が別契約になることはなく、`test.each`（断定）で表現すべきだからである。ループが純粋に setup（中に `expect` を含まない状態構築）であれば対象外。

一方、ヘルパー関数越し・クロスファイルの隠れ expect の個数推定は依然として静的解析の射程外であり行わない（lint の原理的盲点）。これは `loop-each` の対象にも含めない。

## 6. 正規化データモデル ExpectOccurrence

`expect(<base>).<modifier?>.<matcher>(<args>)` を matcher 呼び出しの最外 `CallExpression` から内側へ `MemberExpression` 連鎖を辿り、1 レコードへ正規化する。

| フィールド             | 内容                                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matcherName`          | 終端 property 名。computed（`expect(x)["toBe"]`）は null。                                                                                                                       |
| `negation`             | 連鎖に `not` を含むか。                                                                                                                                                          |
| `modifier`             | 連鎖の `resolves` / `rejects` / null。                                                                                                                                           |
| `matcherArgs`          | matcher 引数の AST。比較は structuralKey による。                                                                                                                                |
| `base`                 | `expect(...)` 第 1 引数。`baseShape` へ分解。                                                                                                                                    |
| `baseShape.kind`       | `member`（`r.a`）/ `call`（`add(1,2)`）/ `identifier`（`r`）/ `other`（論理式・三項・spread 等）。                                                                               |
| `baseShape.root`       | member の最深 object 名 / call の callee 正規化名。                                                                                                                              |
| `baseShape.accessPath` | member のプロパティ列（`["a"]`）。member 連鎖に computed（`r[i]`）が 1 つでもあれば、フィールド名が静的に確定しないため kind を `other` に倒す（consolidate の誤断定を避ける）。 |
| `baseShape.callArgs`   | call の引数 node 列。                                                                                                                                                            |
| `sourceOrder`          | テスト本体 statement 列内の出現インデックス。                                                                                                                                    |

`structuralKey(node)` は AST を再帰で辿り、**リテラル値を捨象** し、**Identifier 名・プロパティ名は保持** した文字列を返す。これにより `add(1,2)` と `add(3,4)` は同形（同じ key）、`result.a` と `result.b` は異形（別 key）と峻別できる。これが「何が一定で何が変化しているか」を判定する核である。computed メンバ base・spread を含む call 引数は安全側（generic に倒す）へ寄せる。optional chain（`r?.a`）は `ChainExpression` を剥がして通常の member と同様に扱う。

## 7. 振り分けアルゴリズム routeTest

```
0. ループ／反復コールバック内に expect があれば → loop-each（direct 個数の判定より先に行う）。
1. direct expect を収集。n = 個数。n <= 1 → abstain（沈黙してよい唯一のケース）。
2. Step 0 順序: 最初の expect と最後の expect の「間」に Act があれば → split-by-act。
3. guard: いずれかの expect で matcherName が null、または baseShape.kind が other → generic。
4. Step 1 同形性: signature = { matcherName, negation, modifier, baseKind }。
     いずれか不一致 → split-by-heterogeneity。
5. Step 2 変化の所在（ここで baseKind は全 expect 同一）:
     - kind === member:
         root 全一致 ∧ accessPath 相違 → consolidate
         それ以外（別オブジェクト／完全重複）→ generic
     - kind === call:
         callee 不一致 → split-by-heterogeneity
         引数に spread を含む、または引数の構造（structuralKey）が不一致 → generic
         引数の構造一致 ∧ 引数の「値」が相違（call の入力が実際に変化）→ each-or-split
         引数の値も同一（入力が同じで expected だけ違う／完全重複）→ generic
     - kind === identifier:
         → generic
6. 上記で出口が確定しなかった残り → generic。
```

出口を名指しできない分岐（3・5・6）は沈黙ではなく `generic`。禁止（error）は必ず維持し、出口だけを汎用診断に落とす。沈黙するのは 1 の「違反でない」場合のみ。**consolidate の断定を誤ると有害**（書いていないフィールドを見逃す toEqual を勧めかねない）なので、確実に同一レシーバの別プロパティ参照と判る場合のみ統合を断定する。

## 8. 各 Step の AST 述語

- **Step 0（Act 挟み込み）**: テスト本体の statement 列を走査。`expect` を含む `ExpressionStatement` を E、それ以外で観測状態を変えうるものを A（Act）とする。A の判定は保守的に次のみ: `AssignmentExpression` / `UpdateExpression`（`x++` 等）/ `await` を伴う式文 / **メソッド呼び出し**で「既知 mutating メソッド名（`.push` `.pop` `.shift` `.unshift` `.splice` `.sort` `.reverse` `.fill` `.copyWithin` `.set` `.delete` `.add` `.clear` `.dispatch`）」または「検証対象レシーバ（このテストの expect が見ている root 識別子）への呼び出し」のいずれか。**自由関数呼び出し（`console.log()` 等、レシーバ無し）は Act としない**（純粋呼び出しの誤検出回避）。この設計により、`counter.increment()`（`counter.value` を検証中＝レシーバが対象）は Act だが `console.log()` は Act でない、と峻別できる。`VariableDeclaration` は（最初の expect の前後を問わず）setup とみなし Act 扱いしない。最初の expect と最後の expect の開区間に A が 1 つでもあれば split-by-act。
- **Step 1（同形性）**: 4 要素 signature `{ matcherName, negation, modifier, baseKind }` の不一致で split-by-heterogeneity。matcher 名だけの比較では `toBe` と `not.toBe`、同期と `resolves` の差を取りこぼすため 4 要素を正とする。matcherArgs の値違いはここでは見ない（Step 2 の領域）。
- **Step 2（変化の所在）**: member は「root 同一 ∧ property 名が相違」、call は「callee の structuralKey 同一 ∧ arguments の structuralKey 同一 ∧ 値のみ相違」を判定。structuralKey がリテラル値を捨象するので、値だけ違う引数は同形、フィールド名が違う member は異形、と分けられる。

## 9. メッセージカタログ

oxlint の JS プラグインは `context.report({ message, node })` に文字列を直接渡す（messageId 機構は使わない）。メッセージはトーンを **断定（assertive）と問い（inquiry）の 2 値に固定** し、placeholder には「エージェントがコードを再走査せずに済む観測結果」（対象式・フィールド名・混在 matcher・挟まった Act・入力差）を AST から埋める。各メッセージは番号付き手順を含み、隣の出口への流出を防ぐ自己定義の一文（「これは分割ではない」等）を持つ。言語は英語（読み手が主にコーディングエージェントのため、かつ前例も英語）。

- `consolidate(root, fields[])`（断定）: 同一オブジェクト `root` の複数フィールド `fields` を個別 expect で見ている。全フィールドを書いた網羅的 `toEqual` 1 つに統合せよ。部分一致（`toMatchObject` 等）は使うな。期待値に書いていないフィールドが存在してはならない。これは分割でも each でもない。
- `split-by-act(actDescription)`（断定）: expect の間に状態変更 `actDescription` が挟まる。初期状態と操作後は別々の振る舞い。Act を境界に test を分割し、後半に独立した Arrange / Act を書け（空の分割は禁止）。問題は expect の数ではなく間に Act があること。これは toEqual への統合ではない。
- `split-by-heterogeneity(matcherSummary)`（断定）: matcher / 被検証式の形 `matcherSummary` が揃わない＝契約が複数。test を契約ごとに分割せよ。これは toEqual への集約ではない。
- `each-or-split(operation, caseCount)`（問い）: 同一操作 `operation` の入力違いが `caseCount` 件。構文からは決められないので断定しない。候補1 = データだけ違うなら `test.each`。候補2 = 別の契約（正常系と境界・異常系等）なら test 分割。判断基準は「各ケースを 1 文に言い換え、同じ文の値違いなら each、違う主張なら split」。意図を知るあなた（エージェント）が選べ。
- `generic(count)`（問い）: 出口を確定できない／分類が generic に倒れたとき。禁止（複数 expect、`count` 件）は維持したうえで、4 枝の判定順（Act → 異種 → 同フィールド → 入力違い）を自己診断チェックリストとして全て書き、読み手が同じアルゴリズムを辿って正しい出口へ着地できるようにする。

## 10. 基盤（前例準拠・Phase 0 で確立済み）

- ESLint 互換プラグインを単一 `src/index.ts` に実装（`{ meta, rules }` / `create(context)` が visitor を返す / `context.report`）。oxlint の `jsPlugins` で読み込んで動かす。`eslint` 本体・`@typescript-eslint/*` への依存は持たない（ランタイムは oxlint が供給、AST は ESTree/TS-ESTree 互換ノード）。
- AST 型は自前の最小構造型で表現（前例の `Node` / `CallExpression` / `MemberExpression` … 方式）。`satisfies Plugin` / `satisfies Rule`。
- ビルドは `rimraf dist && tsgo -p tsconfig.build.json`（dist へ emit）。`tsconfig.json` は NodeNext のまま型検査専用。tsup は使わない。
- 検査は `tsgo --noEmit` / `oxlint` / `oxfmt --check` / `knip` / `vitest run`。
- テストは fixtures に oxlint を `spawnSync` し、JSON 診断（`-f json`）を per-file メッセージ列・総数で検証する integration test（前例方式）。
- `.oxlintrc.json` は `jsPlugins: ["./src/index.ts"]` で自己ロードし、本ルールを自分のコードにも適用（dogfood）。`fixtures/cases/**` は repo lint から ignore（意図的に違反するケースを除外）。integration の harness 自身は本ルールを遵守（各 test 1 expect）。
- パッケージ名 `@crescware/eslint-plugin-crescware-single-behavior-per-test`、`engines` は持たない、`publishConfig.access: public`。

## 11. Fixture matrix（網羅）

`fixtures/cases/` に配置（repo lint からは ignore）。各ファイル名は `<verdict>` を反映。integration.test.ts は default 設定で全件を流し、per-file の期待メッセージ列と総診断数を固定する。各 ng ファイルは 1 つの違反テストにつき 1 診断。

### consolidate（断定）

- `ng-consolidate-fields.ts`: `r.status`/`r.code`/`r.body` を個別 `toBe` → consolidate。
- `ng-consolidate-two.ts`: 2 フィールドの最小形。
- `ng-consolidate-nested-path.ts`: `r.a.b` / `r.a.c`（accessPath 相違、root 同一）。

### split-by-act（断定）

- `ng-act-increment.ts`: `c.value` toBe 0 → `c.increment()` → `c.value` toBe 1。
- `ng-act-assignment.ts`: 代入が挟まる。
- `ng-act-update.ts`: `i++` が挟まる。
- `ng-act-mutating-method.ts`: `arr.push(...)` が挟まる。
- `ng-act-await.ts`: `await save()` が挟まる。

### split-by-heterogeneity（断定）

- `ng-hetero-matcher.ts`: `toEqual` と `toThrow` の混在。
- `ng-hetero-negation.ts`: `toBe` と `not.toBe`。
- `ng-hetero-modifier.ts`: `toBe` と `resolves.toBe`。
- `ng-hetero-basekind.ts`: member base と call base の混在。
- `ng-hetero-callee.ts`: `parse(x)` と `serialize(y)`（callee 不一致）。

### each-or-split（問い）

- `ng-each-add.ts`: `add(1,2)` toBe 3 / `add(3,4)` toBe 7。
- `ng-each-three.ts`: 3 ケース。

### loop-each（断定・ループ→ test.each）

- `ng-loop-for-of.ts`: `for-of` ループ内 expect。
- `ng-loop-classic.ts`: 古典 `for` ループ内 expect。
- `ng-loop-foreach.ts`: `forEach` コールバック内 expect。

### generic（問い・フォールバック）

- `ng-generic-computed-matcher.ts`: `expect(x)["toBe"](1)` を含む。
- `ng-generic-other-base.ts`: 三項 / 論理式 / spread を base に持つ。
- `ng-generic-different-objects.ts`: `a.x` と `b.y`（member root 不一致）。
- `ng-generic-exact-dup.ts`: `expect(x).toBe(1)` の完全重複。
- `ng-generic-identifier-base.ts`: 裸の identifier base（`expect(r)` / `expect(s)`）。
- `ng-generic-call-argshape.ts`: 同 callee だが引数構造が非同形 / spread。

### ok（違反なし・沈黙）

- `ok-single.ts`: direct expect 1 個。
- `ok-none.ts`: expect 0 個。
- `ok-concise-arrow.ts`: `() => expect(...)`（block でない＝単一）。
- `ok-loop-setup.ts`: ループは状態構築のみ（中に expect なし）＋ direct expect 1 個。
- `ok-nested-helper.ts`: ヘルパー関数内 expect のみ（lint の盲点として現状は沈黙）。
- `ok-separate-tests.ts`: 別々の test に 1 個ずつ。
- `ok-each-single.ts`: `it`/`test.each` で各 1 個。

### 設定バリアント

v1 はオプション無し（議事録に options の要求は無い）。テスト対象の callee 名は `test` / `it` 固定。将来オプションを足す場合は前例同様 `oxlintrc.<variant>.json` を追加し integration に describe を増やす。

## 12. 実装フェーズ（修正版）

- **Phase 0（完了）**: 前例準拠の配線 + 禁止コア（direct expect 2 以上 → generic 報告）+ 最小 fixtures + integration + 全 green。
- **Phase 1**: ExpectOccurrence 正規化 + structuralKey + `consolidate` 断定。member 経路の locus 判定。consolidate / generic の fixtures を追加。
- **Phase 2**: `split-by-act`（保守的 Act 検出）と `split-by-heterogeneity`（4 要素 signature）。actDescription / matcherSummary placeholder。対応 fixtures。
- **Phase 3**: `each-or-split`（call 経路、inquiry、両候補 + 基準）。operation / caseCount placeholder。対応 fixtures。
- **Phase 4**: `generic` 自己診断チェックリストの拡充、hidden expect の注意喚起（direct 0〜1 かつ nested 痕跡時の低コスト注意 1 本）。残り generic fixtures。
- **Phase 5**: docs/rules/single-behavior-per-test.md と README 整備。jest 対応は不要（vitest のみ）。

## 13. 既知のリスク

- structuralKey の境界（computed / Spread / Template）は単体観点での fixtures で先に固定し、判別不能は abstain/generic に倒す。
- oxlint が JS プラグインへ渡すノードに `parent` / `range` が乗るか（Act の前後関係や enclosing 判定で必要になりうる）は実機確認する。direct expect の収集は test コールバックを上から辿る方式（parent 不要）を基本とする。
- consolidate の過剰断定（別オブジェクトの取り違え）を避けるため、root 一致の判定は最深 object 名の単純一致に限定し、少しでも曖昧なら generic に落とす。
