# Pocket Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Flask inspiration app into a pocket-style workbench with an inbox-first sorting flow, themed boxes, type-specific cards, and lightweight placement suggestions.

**Architecture:** Extend the existing `Inspiration` model instead of replacing it, add a small `Box` model plus item placement metadata, expose placement APIs from the Flask app, and reshape the existing index page into a three-zone workbench. Keep capture and editing flows intact while shifting the main experience from filter-first listing to inbox-first sorting.

**Tech Stack:** Flask, Flask-SQLAlchemy, SQLite, server-rendered Jinja templates, vanilla JavaScript, Python `unittest`

---

## File Structure

### Existing Files To Modify

- `D:\02-Projects\brain\brain_app\models.py`
  Add the `Box` model, placement fields on `Inspiration`, and serialization helpers for inbox/sorted state.
- `D:\02-Projects\brain\brain_app\services.py`
  Add suggestion ranking helpers, placement helpers, and workbench-specific queries.
- `D:\02-Projects\brain\brain_app\routes.py`
  Expose workbench data to the main page and add placement / move APIs.
- `D:\02-Projects\brain\templates\index.html`
  Replace the current generic filter view with the inbox-first workbench UI.
- `D:\02-Projects\brain\tests\test_app.py`
  Extend tests for box creation, suggestion visibility, placement flow, and inbox toggle behavior.
- `D:\02-Projects\brain\README.md`
  Update the product description after the workbench is live.

### New Files To Create

- `D:\02-Projects\brain\templates\partials\workbench_card.html`
  Shared card partial for type-specific card rendering.

### Files Explicitly Out Of Scope

- `D:\02-Projects\brain\templates\add.html`
- `D:\02-Projects\brain\templates\edit.html`

These can keep their current shape in the first build.

## Task 1: Add Box And Inbox State To The Data Model

**Files:**
- Modify: `D:\02-Projects\brain\brain_app\models.py`
- Test: `D:\02-Projects\brain\tests\test_app.py`

- [ ] **Step 1: Write the failing test**

```python
def test_item_can_be_placed_into_box_and_leave_inbox(self):
    with self.app.app_context():
        box = Box(name="产品灵感", color="#f97316")
        db.session.add(box)
        db.session.commit()

        item = db.session.get(Inspiration, self.first_id)
        item.place_into_box(box)
        db.session.commit()

        self.assertEqual(item.box_id, box.id)
        self.assertFalse(item.is_inbox)
        self.assertEqual(item.box.name, "产品灵感")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_item_can_be_placed_into_box_and_leave_inbox -v`
Expected: FAIL because `Box` and `place_into_box` do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```python
class Box(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True)
    color = db.Column(db.String(20), default="#f97316", nullable=False)
    description = db.Column(db.String(255), default="")
    sort_order = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False)

    items = db.relationship("Inspiration", back_populates="box", lazy=True)


class Inspiration(db.Model):
    box_id = db.Column(db.Integer, db.ForeignKey("box.id"))
    is_inbox = db.Column(db.Boolean, default=True, nullable=False)

    box = db.relationship("Box", back_populates="items")

    def place_into_box(self, box: Box) -> None:
        self.box = box
        self.box_id = box.id
        self.is_inbox = False

    def move_back_to_inbox(self) -> None:
        self.box = None
        self.box_id = None
        self.is_inbox = True
```

- [ ] **Step 4: Extend serialization for workbench data**

```python
def to_dict(self) -> dict:
    return {
        "id": self.id,
        "title": self.title,
        "content": self.content or "",
        "content_type": self.content_type,
        "file_path": self.file_path,
        "source": self.source or "",
        "category": self.category or "",
        "tags": self.tags or "",
        "tag_list": self.tag_list(),
        "status": self.status,
        "notes": self.notes or "",
        "children": self.parsed_children(),
        "box_id": self.box_id,
        "box_name": self.box.name if self.box else "",
        "is_inbox": self.is_inbox,
        "created_at": self.created_at.strftime("%Y-%m-%d %H:%M"),
        "updated_at": self.updated_at.strftime("%Y-%m-%d %H:%M"),
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_item_can_be_placed_into_box_and_leave_inbox -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add D:/02-Projects/brain/brain_app/models.py D:/02-Projects/brain/tests/test_app.py
git commit -m "add box model and inbox placement state"
```

## Task 2: Add Suggestion Ranking And Placement Helpers

**Files:**
- Modify: `D:\02-Projects\brain\brain_app\services.py`
- Modify: `D:\02-Projects\brain\brain_app\models.py`
- Test: `D:\02-Projects\brain\tests\test_app.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_suggest_boxes_prefers_matching_category_and_tags(self):
    with self.app.app_context():
        product_box = Box(name="产品灵感", color="#f97316")
        design_box = Box(name="设计参考", color="#2563eb")
        db.session.add_all([product_box, design_box])
        db.session.commit()

        item = Inspiration(
            title="AI 产品首页拆解",
            content="Landing page inspiration",
            category="产品",
            tags="AI, 产品, 设计",
        )
        db.session.add(item)
        db.session.commit()

        suggestions = suggest_boxes_for_item(item)
        self.assertEqual(suggestions[0]["name"], "产品灵感")
        self.assertLessEqual(len(suggestions), 3)

def test_place_item_into_box_api_hides_item_from_default_inbox(self):
    with self.app.app_context():
        box = Box(name="内容选题", color="#22c55e")
        db.session.add(box)
        db.session.commit()
        box_id = box.id

    response = self.client.post(f"/api/items/{self.first_id}/place", json={"box_id": box_id})
    self.assertEqual(response.status_code, 200)

    inbox_response = self.client.get("/")
    html = inbox_response.get_data(as_text=True)
    self.assertNotIn("Alpha idea", html)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_suggest_boxes_prefers_matching_category_and_tags tests.test_app.TestAppCase.test_place_item_into_box_api_hides_item_from_default_inbox -v`
Expected: FAIL because suggestion and placement helpers do not exist yet.

- [ ] **Step 3: Write minimal suggestion helpers**

```python
def normalize_box_tokens(text: str) -> set[str]:
    cleaned = re.split(r"[\s,，/]+", (text or "").strip().lower())
    return {token for token in cleaned if token}


def suggest_boxes_for_item(item: Inspiration, limit: int = 3) -> list[dict]:
    suggestions: list[dict] = []
    item_terms = normalize_box_tokens(" ".join([item.title, item.category, item.tags, item.source]))

    for box in Box.query.order_by(Box.sort_order.asc(), Box.created_at.asc()).all():
        box_terms = normalize_box_tokens(" ".join([box.name, box.description]))
        score = len(item_terms & box_terms)
        if item.category and item.category in box.name:
            score += 2
        if score > 0:
            suggestions.append({"id": box.id, "name": box.name, "color": box.color, "score": score})

    suggestions.sort(key=lambda box: (-box["score"], box["name"]))
    return suggestions[:limit]


def place_item_into_box(item: Inspiration, box_id: int) -> Inspiration:
    box = db.session.get(Box, box_id)
    if not box:
        raise ValueError("盒子不存在")
    item.place_into_box(box)
    db.session.commit()
    return item
```

- [ ] **Step 4: Add inbox and sorted queries**

```python
def get_inbox_items(show_sorted: bool = False) -> list[Inspiration]:
    query = Inspiration.query.order_by(Inspiration.created_at.desc())
    if not show_sorted:
        query = query.filter(Inspiration.is_inbox.is_(True))
    return query.all()


def get_boxes() -> list[Box]:
    return Box.query.order_by(Box.sort_order.asc(), Box.created_at.asc()).all()
```

- [ ] **Step 5: Run tests to verify they still fail for routing gaps only**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_suggest_boxes_prefers_matching_category_and_tags tests.test_app.TestAppCase.test_place_item_into_box_api_hides_item_from_default_inbox -v`
Expected: suggestion test PASS, placement route test still FAIL because route and index filtering are not wired yet.

- [ ] **Step 6: Commit**

```bash
git add D:/02-Projects/brain/brain_app/services.py D:/02-Projects/brain/brain_app/models.py D:/02-Projects/brain/tests/test_app.py
git commit -m "add box suggestion and placement helpers"
```

## Task 3: Wire Workbench Routes And Placement APIs

**Files:**
- Modify: `D:\02-Projects\brain\brain_app\routes.py`
- Modify: `D:\02-Projects\brain\brain_app\services.py`
- Test: `D:\02-Projects\brain\tests\test_app.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_index_exposes_box_and_suggestion_data(self):
    with self.app.app_context():
        box = Box(name="产品灵感", color="#f97316")
        db.session.add(box)
        db.session.commit()

    response = self.client.get("/?show_sorted=1")
    html = response.get_data(as_text=True)
    self.assertIn("产品灵感", html)
    self.assertIn("未整理", html)

def test_move_item_back_to_inbox_api(self):
    with self.app.app_context():
        box = Box(name="设计参考", color="#2563eb")
        db.session.add(box)
        db.session.commit()
        item = db.session.get(Inspiration, self.first_id)
        item.place_into_box(box)
        db.session.commit()

    response = self.client.post(f"/api/items/{self.first_id}/move-back")
    self.assertEqual(response.status_code, 200)

    with self.app.app_context():
        item = db.session.get(Inspiration, self.first_id)
        self.assertTrue(item.is_inbox)
        self.assertIsNone(item.box_id)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_index_exposes_box_and_suggestion_data tests.test_app.TestAppCase.test_move_item_back_to_inbox_api -v`
Expected: FAIL because the main route and move-back API do not expose workbench state yet.

- [ ] **Step 3: Write minimal route implementation**

```python
@bp.route("/")
def index():
    show_sorted = request.args.get("show_sorted", "").strip() in {"1", "true", "yes"}
    items = get_inbox_items(show_sorted=show_sorted)
    serialized_items = []
    for item in items:
        item_dict = serialize_item(item)
        item_dict["suggested_boxes"] = suggest_boxes_for_item(item)
        serialized_items.append(item_dict)

    return render_template(
        "index.html",
        items=serialized_items,
        boxes=[box.to_dict() for box in get_boxes()],
        show_sorted=show_sorted,
        stats=get_stats(),
        categories=get_categories(),
    )


@bp.route("/api/items/<int:item_id>/place", methods=["POST"])
def place_item(item_id: int):
    item = db.session.get(Inspiration, item_id)
    if not item:
        return jsonify({"success": False, "error": "记录不存在"}), 404
    data = request.get_json(silent=True) or {}
    try:
        item = place_item_into_box(item, int(data.get("box_id")))
    except (TypeError, ValueError) as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    return jsonify({"success": True, "item": serialize_item(item)})


@bp.route("/api/items/<int:item_id>/move-back", methods=["POST"])
def move_item_back(item_id: int):
    item = db.session.get(Inspiration, item_id)
    if not item:
        return jsonify({"success": False, "error": "记录不存在"}), 404
    item.move_back_to_inbox()
    db.session.commit()
    return jsonify({"success": True, "item": serialize_item(item)})
```

- [ ] **Step 4: Add `to_dict` to `Box`**

```python
def to_dict(self) -> dict:
    return {
        "id": self.id,
        "name": self.name,
        "color": self.color,
        "description": self.description or "",
        "sort_order": self.sort_order,
        "item_count": len(self.items),
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_index_exposes_box_and_suggestion_data tests.test_app.TestAppCase.test_move_item_back_to_inbox_api tests.test_app.TestAppCase.test_place_item_into_box_api_hides_item_from_default_inbox -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add D:/02-Projects/brain/brain_app/routes.py D:/02-Projects/brain/brain_app/services.py D:/02-Projects/brain/brain_app/models.py D:/02-Projects/brain/tests/test_app.py
git commit -m "add workbench routes and placement APIs"
```

## Task 4: Rebuild The Main Screen Into The Pocket Workbench

**Files:**
- Create: `D:\02-Projects\brain\templates\partials\workbench_card.html`
- Modify: `D:\02-Projects\brain\templates\index.html`
- Test: `D:\02-Projects\brain\tests\test_app.py`

- [ ] **Step 1: Write the failing test**

```python
def test_index_renders_workbench_sections_and_actions(self):
    response = self.client.get("/")

    self.assertEqual(response.status_code, 200)
    html = response.get_data(as_text=True)
    self.assertIn("未整理", html)
    self.assertIn("主题盒子", html)
    self.assertIn("一键放入", html)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_index_renders_workbench_sections_and_actions -v`
Expected: FAIL because the current page does not contain the workbench labels and actions.

- [ ] **Step 3: Create the card partial**

```jinja2
<article class="work-card work-card-{{ item.content_type }}">
  <header class="work-card-head">
    <span class="type-pill">{{ type_icons[item.content_type] }} {{ item.content_type }}</span>
    {% if item.suggested_boxes %}
    <button class="btn btn-primary quick-place-btn"
            data-item-id="{{ item.id }}"
            data-box-id="{{ item.suggested_boxes[0].id }}"
            type="button">
      一键放入 {{ item.suggested_boxes[0].name }}
    </button>
    {% endif %}
  </header>
  <h3>{{ item.title }}</h3>
  <p class="meta">{{ item.source or "未标注来源" }}</p>
  {% if item.content_type == "图片" and item.file_path %}
  <img class="card-media" src="{{ url_for('main.uploaded_file', filename=item.file_path) }}" alt="{{ item.title }}">
  {% elif item.content_type == "组合" %}
  <div class="bundle-preview">内含 {{ item.children|length }} 项</div>
  {% else %}
  <p class="line clamp-3">{{ item.content }}</p>
  {% endif %}
  <div class="suggestions">
    {% for box in item.suggested_boxes %}
    <button class="suggestion-chip" data-item-id="{{ item.id }}" data-box-id="{{ box.id }}" type="button">{{ box.name }}</button>
    {% endfor %}
  </div>
  <p class="tags">{{ item.tags or "未生成标签" }}</p>
</article>
```

- [ ] **Step 4: Replace the index layout**

```jinja2
<section class="workbench-shell">
  <aside class="box-rail panel">
    <div class="section-head">
      <h2>主题盒子</h2>
      <p>拖动卡片到盒子里完成归位。</p>
    </div>
    {% for box in boxes %}
    <button class="box-dropzone" data-box-id="{{ box.id }}" type="button" style="--box-color: {{ box.color }};">
      <strong>{{ box.name }}</strong>
      <span>{{ box.item_count }} 项</span>
    </button>
    {% else %}
    <p class="hint">先创建几个盒子，后续建议和拖放才有目的地。</p>
    {% endfor %}
  </aside>

  <main class="workbench-main">
    <section class="capture-bar panel">
      <h2>大口袋</h2>
      <p>先扔进来，再整理。</p>
      <button id="openQuickBtn" class="btn btn-primary" type="button">快速放入内容</button>
      <label class="toggle">
        <input type="checkbox" id="showSortedToggle" {% if show_sorted %}checked{% endif %}>
        <span>显示已归位内容</span>
      </label>
    </section>

    <section class="inbox-grid">
      {% for item in items %}
      {% include "partials/workbench_card.html" %}
      {% endfor %}
    </section>
  </main>
</section>
```

- [ ] **Step 5: Add minimal drag/drop and quick-place scripts**

```html
<script>
  async function placeItem(itemId, boxId) {
    const response = await fetch(`/api/items/${itemId}/place`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ box_id: boxId }),
    });
    if (response.ok) window.location.reload();
  }

  document.querySelectorAll('.work-card').forEach((card) => {
    card.draggable = true;
    card.addEventListener('dragstart', () => {
      card.classList.add('dragging');
      event.dataTransfer.setData('text/plain', card.dataset.itemId);
    });
  });

  document.querySelectorAll('.box-dropzone').forEach((box) => {
    box.addEventListener('dragover', (event) => event.preventDefault());
    box.addEventListener('drop', (event) => {
      event.preventDefault();
      placeItem(event.dataTransfer.getData('text/plain'), box.dataset.boxId);
    });
  });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_index_renders_workbench_sections_and_actions -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add D:/02-Projects/brain/templates/index.html D:/02-Projects/brain/templates/partials/workbench_card.html D:/02-Projects/brain/tests/test_app.py
git commit -m "rebuild main page into pocket workbench"
```

## Task 5: Add Bundle Visibility And Regression Coverage

**Files:**
- Modify: `D:\02-Projects\brain\templates\index.html`
- Modify: `D:\02-Projects\brain\templates\partials\workbench_card.html`
- Modify: `D:\02-Projects\brain\tests\test_app.py`
- Modify: `D:\02-Projects\brain\README.md`

- [ ] **Step 1: Write the failing tests**

```python
def test_bundle_card_shows_folder_style_summary(self):
    merge_response = self.client.post("/api/merge", json={"ids": [self.first_id, self.second_id]})
    self.assertEqual(merge_response.status_code, 200)

    response = self.client.get("/?show_sorted=1")
    html = response.get_data(as_text=True)
    self.assertIn("内含 2 项", html)
    self.assertIn("组合", html)

def test_failed_suggestions_do_not_break_index(self):
    with patch("brain_app.routes.suggest_boxes_for_item", side_effect=RuntimeError("boom")):
        response = self.client.get("/")

    self.assertEqual(response.status_code, 200)
    self.assertIn("未整理", response.get_data(as_text=True))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_bundle_card_shows_folder_style_summary tests.test_app.TestAppCase.test_failed_suggestions_do_not_break_index -v`
Expected: FAIL because bundle summary and suggestion failure fallback are not implemented.

- [ ] **Step 3: Add safe suggestion fallback in the route**

```python
for item in items:
    item_dict = serialize_item(item)
    try:
        item_dict["suggested_boxes"] = suggest_boxes_for_item(item)
    except Exception:
        item_dict["suggested_boxes"] = []
    serialized_items.append(item_dict)
```

- [ ] **Step 4: Add bundle summary rendering and README update**

```jinja2
{% elif item.content_type == "组合" %}
<div class="bundle-preview">
  <strong>文件夹内容包</strong>
  <span>内含 {{ item.children|length }} 项</span>
</div>
```

```markdown
## 当前主界面

- 所有新内容先进入 `未整理`
- 左侧是主题盒子
- 卡片支持建议放入、一键放入和拖拽归位
- 已归位内容默认隐藏，可手动切换显示
```

- [ ] **Step 5: Run targeted tests and then the full suite**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_bundle_card_shows_folder_style_summary tests.test_app.TestAppCase.test_failed_suggestions_do_not_break_index -v`
Expected: PASS

Run: `.\.venv\Scripts\python.exe -m unittest discover -s tests -v`
Expected: PASS with all tests green.

- [ ] **Step 6: Commit**

```bash
git add D:/02-Projects/brain/brain_app/routes.py D:/02-Projects/brain/templates/index.html D:/02-Projects/brain/templates/partials/workbench_card.html D:/02-Projects/brain/tests/test_app.py D:/02-Projects/brain/README.md
git commit -m "polish bundle cards and workbench docs"
```

## Self-Review

### Spec Coverage

- inbox-first workflow: covered by Tasks 1, 3, and 4
- themed boxes: covered by Tasks 1, 3, and 4
- type-specific cards: covered by Task 4
- bundle card: covered by Task 5
- suggestions plus one-click placement: covered by Tasks 2, 3, and 4
- show/hide already-sorted items: covered by Tasks 3 and 4

No spec gaps remain for the first build.

### Placeholder Scan

- no `TODO`
- no `TBD`
- every task has exact files, commands, and code snippets

### Type Consistency

- `Box`
- `box_id`
- `is_inbox`
- `place_into_box`
- `move_back_to_inbox`
- `suggest_boxes_for_item`

These names are used consistently across model, service, route, and template tasks.
