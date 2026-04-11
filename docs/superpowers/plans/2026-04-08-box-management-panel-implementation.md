# Box Management Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-context management panel for the currently opened box so the user can rename, recolor, reorder, and destructively delete boxes without changing the current browse-first workbench flow.

**Architecture:** Extend the existing Flask workbench in place. Keep `Box` as the source of truth for rail ordering, add focused service helpers for update/move/delete behavior, expose three box-management APIs from `brain_app.routes`, and reuse the existing overlay pattern in `templates/index.html` for the selected-box panel. Handle destructive delete in application logic so uploaded files and related inspirations are cleaned up together.

**Tech Stack:** Flask, Flask-SQLAlchemy, SQLite, Jinja templates, vanilla JavaScript, Python `unittest`

---

## File Structure

### Existing Files To Modify

- `D:\02-Projects\brain\brain_app\services.py`
  Add box update, reordering, and destructive delete helpers.
- `D:\02-Projects\brain\brain_app\routes.py`
  Add box-management APIs and selected-box template context needed by the new panel.
- `D:\02-Projects\brain\templates\index.html`
  Add the selected-box management button, overlay panel, confirmation flow, and API wiring.
- `D:\02-Projects\brain\tests\test_app.py`
  Add regression coverage for update, move, delete, file cleanup, and selected-box UI affordances.

### Files Explicitly Out Of Scope

- `D:\02-Projects\brain\brain_app\models.py`
  Existing `Box` and `Inspiration` fields are already enough for this feature.
- `D:\02-Projects\brain\templates\partials\workbench_card.html`
  Card rendering should remain unchanged in this feature.
- `D:\02-Projects\brain\tests\test_mobile_api.py`
  Mobile CRUD endpoints are unrelated to this selected-box management flow.

## Task 1: Add Service Helpers For Updating And Reordering Boxes

**Files:**
- Modify: `D:\02-Projects\brain\brain_app\services.py`
- Test: `D:\02-Projects\brain\tests\test_app.py`

- [ ] **Step 1: Write the failing tests**

```python
    def test_update_box_updates_name_color_and_description(self):
        with self.app.app_context():
            box = Box(name="产品灵感", color="#f97316", description="旧描述", sort_order=1)
            db.session.add(box)
            db.session.commit()

            updated = update_box(
                box.id,
                name="设计参考",
                color="#2563eb",
                description="新的说明",
            )

            self.assertEqual(updated.name, "设计参考")
            self.assertEqual(updated.color, "#2563eb")
            self.assertEqual(updated.description, "新的说明")

    def test_update_box_rejects_blank_or_duplicate_name(self):
        with self.app.app_context():
            first = Box(name="产品灵感", color="#f97316", sort_order=1)
            second = Box(name="设计参考", color="#2563eb", sort_order=2)
            db.session.add_all([first, second])
            db.session.commit()

            with self.assertRaisesRegex(ValueError, "盒子名称不能为空"):
                update_box(first.id, name="   ", color="#f97316", description="")

            with self.assertRaisesRegex(ValueError, "盒子名称已存在"):
                update_box(first.id, name="设计参考", color="#f97316", description="")

    def test_move_box_swaps_sort_order_with_adjacent_box(self):
        with self.app.app_context():
            first = Box(name="收集", color="#f97316", sort_order=1)
            second = Box(name="设计参考", color="#2563eb", sort_order=2)
            third = Box(name="实现想法", color="#22c55e", sort_order=3)
            db.session.add_all([first, second, third])
            db.session.commit()

            move_box(second.id, "up")
            self.assertEqual([box.name for box in get_boxes()], ["设计参考", "收集", "实现想法"])

            move_box(second.id, "down")
            self.assertEqual([box.name for box in get_boxes()], ["收集", "设计参考", "实现想法"])

    def test_move_box_rejects_invalid_and_out_of_range_moves(self):
        with self.app.app_context():
            first = Box(name="收集", color="#f97316", sort_order=1)
            second = Box(name="设计参考", color="#2563eb", sort_order=2)
            db.session.add_all([first, second])
            db.session.commit()

            with self.assertRaisesRegex(ValueError, "无效的移动方向"):
                move_box(first.id, "left")

            with self.assertRaisesRegex(ValueError, "已经在最上面"):
                move_box(first.id, "up")

            with self.assertRaisesRegex(ValueError, "已经在最下面"):
                move_box(second.id, "down")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_update_box_updates_name_color_and_description tests.test_app.TestAppCase.test_update_box_rejects_blank_or_duplicate_name tests.test_app.TestAppCase.test_move_box_swaps_sort_order_with_adjacent_box tests.test_app.TestAppCase.test_move_box_rejects_invalid_and_out_of_range_moves -v`

Expected: FAIL because `update_box` and `move_box` do not exist in `brain_app.services`.

- [ ] **Step 3: Write minimal implementation**

```python
def update_box(box_id: int, name: str, color: str, description: str) -> Box:
    box = db.session.get(Box, box_id)
    if not box:
        raise ValueError("盒子不存在")

    normalized_name = (name or "").strip()
    if not normalized_name:
        raise ValueError("盒子名称不能为空")

    duplicate = Box.query.filter(Box.name == normalized_name, Box.id != box.id).first()
    if duplicate:
        raise ValueError("盒子名称已存在")

    box.name = normalized_name
    box.color = (color or "").strip() or "#f97316"
    box.description = (description or "").strip()
    db.session.commit()
    return box


def move_box(box_id: int, direction: str) -> list[Box]:
    if direction not in {"up", "down"}:
        raise ValueError("无效的移动方向")

    boxes = get_boxes()
    current_index = next((index for index, box in enumerate(boxes) if box.id == box_id), None)
    if current_index is None:
        raise ValueError("盒子不存在")

    if direction == "up":
        if current_index == 0:
            raise ValueError("已经在最上面")
        swap_index = current_index - 1
    else:
        if current_index == len(boxes) - 1:
            raise ValueError("已经在最下面")
        swap_index = current_index + 1

    current_box = boxes[current_index]
    swap_box = boxes[swap_index]
    current_box.sort_order, swap_box.sort_order = swap_box.sort_order, current_box.sort_order
    db.session.commit()
    return get_boxes()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_update_box_updates_name_color_and_description tests.test_app.TestAppCase.test_update_box_rejects_blank_or_duplicate_name tests.test_app.TestAppCase.test_move_box_swaps_sort_order_with_adjacent_box tests.test_app.TestAppCase.test_move_box_rejects_invalid_and_out_of_range_moves -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/brain_app/services.py D:/02-Projects/brain/tests/test_app.py
git commit -m "add box update and move helpers"
```

## Task 2: Add Destructive Box Delete With Card And File Cleanup

**Files:**
- Modify: `D:\02-Projects\brain\brain_app\services.py`
- Test: `D:\02-Projects\brain\tests\test_app.py`

- [ ] **Step 1: Write the failing tests**

```python
    def test_delete_box_removes_box_and_assigned_items(self):
        with self.app.app_context():
            box = Box(name="设计参考", color="#2563eb", sort_order=1)
            db.session.add(box)
            db.session.commit()

            first = db.session.get(Inspiration, self.first_id)
            second = db.session.get(Inspiration, self.second_id)
            first.place_into_box(box)
            second.place_into_box(box)
            db.session.commit()

            deleted_count = delete_box(box.id)

            self.assertEqual(deleted_count, 2)
            self.assertIsNone(db.session.get(Box, box.id))
            self.assertIsNone(db.session.get(Inspiration, self.first_id))
            self.assertIsNone(db.session.get(Inspiration, self.second_id))

    def test_delete_box_removes_uploaded_files_for_deleted_items(self):
        with self.app.app_context():
            box = Box(name="图片参考", color="#22c55e", sort_order=1)
            db.session.add(box)
            db.session.commit()

            upload_path = self.upload_dir / "cover.png"
            upload_path.parent.mkdir(parents=True, exist_ok=True)
            upload_path.write_bytes(b"fake image bytes")

            item = db.session.get(Inspiration, self.first_id)
            item.file_path = "cover.png"
            item.place_into_box(box)
            db.session.commit()

            delete_box(box.id)

            self.assertFalse(upload_path.exists())

    def test_delete_box_rejects_missing_box(self):
        with self.app.app_context():
            with self.assertRaisesRegex(ValueError, "盒子不存在"):
                delete_box(999999)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_delete_box_removes_box_and_assigned_items tests.test_app.TestAppCase.test_delete_box_removes_uploaded_files_for_deleted_items tests.test_app.TestAppCase.test_delete_box_rejects_missing_box -v`

Expected: FAIL because `delete_box` does not exist.

- [ ] **Step 3: Write minimal implementation**

```python
def delete_box(box_id: int) -> int:
    box = db.session.get(Box, box_id)
    if not box:
        raise ValueError("盒子不存在")

    items = Inspiration.query.filter(Inspiration.box_id == box.id).all()
    deleted_count = len(items)
    for item in items:
        delete_uploaded_file(item.file_path)
        db.session.delete(item)

    db.session.delete(box)
    db.session.commit()
    return deleted_count
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_delete_box_removes_box_and_assigned_items tests.test_app.TestAppCase.test_delete_box_removes_uploaded_files_for_deleted_items tests.test_app.TestAppCase.test_delete_box_rejects_missing_box -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/brain_app/services.py D:/02-Projects/brain/tests/test_app.py
git commit -m "add destructive box delete helper"
```

## Task 3: Expose Box Management APIs From Flask Routes

**Files:**
- Modify: `D:\02-Projects\brain\brain_app\routes.py`
- Modify: `D:\02-Projects\brain\brain_app\services.py`
- Test: `D:\02-Projects\brain\tests\test_app.py`

- [ ] **Step 1: Write the failing tests**

```python
    def test_update_box_api_updates_selected_box_fields(self):
        with self.app.app_context():
            box = Box(name="产品灵感", color="#f97316", description="旧描述", sort_order=1)
            db.session.add(box)
            db.session.commit()
            box_id = box.id

        response = self.client.put(
            f"/api/boxes/{box_id}",
            json={"name": "设计参考", "color": "#2563eb", "description": "新的说明"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["box"]["name"], "设计参考")
        self.assertEqual(payload["box"]["color"], "#2563eb")

    def test_move_box_api_reorders_boxes(self):
        with self.app.app_context():
            first = Box(name="收集", color="#f97316", sort_order=1)
            second = Box(name="设计参考", color="#2563eb", sort_order=2)
            db.session.add_all([first, second])
            db.session.commit()
            second_id = second.id

        response = self.client.post(f"/api/boxes/{second_id}/move", json={"direction": "up"})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual([box["name"] for box in payload["boxes"]], ["设计参考", "收集"])

    def test_delete_box_api_removes_box_and_items(self):
        with self.app.app_context():
            box = Box(name="设计参考", color="#2563eb", sort_order=1)
            db.session.add(box)
            db.session.commit()
            box_id = box.id

            item = db.session.get(Inspiration, self.first_id)
            item.place_into_box(box)
            db.session.commit()

        response = self.client.delete(f"/api/boxes/{box_id}")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["deleted"], 1)

        with self.app.app_context():
            self.assertIsNone(db.session.get(Box, box_id))
            self.assertIsNone(db.session.get(Inspiration, self.first_id))

    def test_box_management_apis_return_readable_errors(self):
        missing_update = self.client.put(
            "/api/boxes/999999",
            json={"name": "不存在", "color": "#000000", "description": ""},
        )
        self.assertEqual(missing_update.status_code, 404)
        self.assertEqual(missing_update.get_json()["error"], "盒子不存在")

        with self.app.app_context():
            box = Box(name="收集", color="#f97316", sort_order=1)
            db.session.add(box)
            db.session.commit()
            box_id = box.id

        bad_move = self.client.post(f"/api/boxes/{box_id}/move", json={"direction": "left"})
        self.assertEqual(bad_move.status_code, 400)
        self.assertEqual(bad_move.get_json()["error"], "无效的移动方向")

        missing_delete = self.client.delete("/api/boxes/999999")
        self.assertEqual(missing_delete.status_code, 404)
        self.assertEqual(missing_delete.get_json()["error"], "盒子不存在")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_update_box_api_updates_selected_box_fields tests.test_app.TestAppCase.test_move_box_api_reorders_boxes tests.test_app.TestAppCase.test_delete_box_api_removes_box_and_items tests.test_app.TestAppCase.test_box_management_apis_return_readable_errors -v`

Expected: FAIL because the new `/api/boxes/<id>` management routes do not exist.

- [ ] **Step 3: Write minimal implementation**

```python
from .services import (
    ...
    delete_box,
    move_box,
    update_box,
)


@bp.route("/api/boxes/<int:box_id>", methods=["PUT"])
def api_update_box(box_id: int):
    data = request.get_json(silent=True) or {}
    try:
        box = update_box(
            box_id,
            name=data.get("name", ""),
            color=data.get("color", ""),
            description=data.get("description", ""),
        )
    except ValueError as exc:
        status_code = 404 if str(exc) == "盒子不存在" else 400
        return jsonify({"success": False, "error": str(exc)}), status_code
    return jsonify({"success": True, "box": box.to_dict()})


@bp.route("/api/boxes/<int:box_id>/move", methods=["POST"])
def api_move_box(box_id: int):
    data = request.get_json(silent=True) or {}
    try:
        boxes = move_box(box_id, data.get("direction", ""))
    except ValueError as exc:
        status_code = 404 if str(exc) == "盒子不存在" else 400
        return jsonify({"success": False, "error": str(exc)}), status_code
    return jsonify({"success": True, "boxes": [box.to_dict() for box in boxes]})


@bp.route("/api/boxes/<int:box_id>", methods=["DELETE"])
def api_delete_box(box_id: int):
    try:
        deleted_count = delete_box(box_id)
    except ValueError as exc:
        status_code = 404 if str(exc) == "盒子不存在" else 400
        return jsonify({"success": False, "error": str(exc)}), status_code
    return jsonify({"success": True, "deleted": deleted_count})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_update_box_api_updates_selected_box_fields tests.test_app.TestAppCase.test_move_box_api_reorders_boxes tests.test_app.TestAppCase.test_delete_box_api_removes_box_and_items tests.test_app.TestAppCase.test_box_management_apis_return_readable_errors -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/brain_app/routes.py D:/02-Projects/brain/brain_app/services.py D:/02-Projects/brain/tests/test_app.py
git commit -m "add box management APIs"
```

## Task 4: Add The Selected-Box Management Panel To The Workbench

**Files:**
- Modify: `D:\02-Projects\brain\templates\index.html`
- Modify: `D:\02-Projects\brain\tests\test_app.py`

- [ ] **Step 1: Write the failing test**

```python
    def test_selected_box_view_shows_management_entry_point(self):
        with self.app.app_context():
            box = Box(name="设计参考", color="#2563eb", description="收纳界面方向", sort_order=1)
            db.session.add(box)
            db.session.commit()
            box_id = box.id

        response = self.client.get(f"/?box_id={box_id}&show_sorted=1")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn("管理这个盒子", html)
        self.assertIn("盒子设置", html)
        self.assertIn('id="boxManageOverlay"', html)
        self.assertIn('id="boxManageForm"', html)
        self.assertIn(f'data-box-id="{box_id}"', html)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_selected_box_view_shows_management_entry_point -v`

Expected: FAIL because the selected-box header does not yet render the management panel markup.

- [ ] **Step 3: Write minimal implementation**

```jinja2
{% if selected_box %}
<div class="capture-actions">
  ...
  <button
    id="openManageBoxBtn"
    class="btn"
    type="button"
    data-box-id="{{ selected_box.id }}"
  >
    管理这个盒子
  </button>
</div>
{% endif %}

<div id="boxManageOverlay" class="quick-overlay" aria-hidden="true">
  <div class="mini-modal">
    <div class="quick-header">
      <div>
        <h3>盒子设置</h3>
        <p class="meta">改名、改色、调整顺序，或者删除这个盒子。</p>
      </div>
      <button id="closeManageBoxBtn" class="btn" type="button">关闭</button>
    </div>

    {% if selected_box %}
    <form id="boxManageForm" class="mini-form" data-box-id="{{ selected_box.id }}">
      <div class="field-group">
        <label for="manage-box-name">盒子名称</label>
        <input id="manage-box-name" name="name" class="field" value="{{ selected_box.name }}" required>
      </div>
      <div class="grid-2">
        <div class="field-group">
          <label for="manage-box-color">盒子颜色</label>
          <input id="manage-box-color" name="color" class="field" type="color" value="{{ selected_box.color }}">
        </div>
        <div class="field-group">
          <label for="manage-box-description">一句说明</label>
          <input id="manage-box-description" name="description" class="field" value="{{ selected_box.description }}">
        </div>
      </div>
      <div class="actions">
        <button id="moveBoxUpBtn" class="btn" type="button">上移</button>
        <button id="moveBoxDownBtn" class="btn" type="button">下移</button>
        <button class="btn btn-primary" type="submit">保存修改</button>
      </div>
      <p id="boxManageHint" class="hint">删除会同时删除盒子里的全部卡片。</p>
      <div class="actions">
        <button id="deleteBoxBtn" class="btn btn-danger" type="button">删除这个盒子</button>
      </div>
    </form>
    {% endif %}
  </div>
</div>
```

```html
<script>
const boxManageOverlay = document.getElementById("boxManageOverlay");
const openManageBoxBtn = document.getElementById("openManageBoxBtn");
const closeManageBoxBtn = document.getElementById("closeManageBoxBtn");
const boxManageForm = document.getElementById("boxManageForm");
const boxManageHint = document.getElementById("boxManageHint");
const moveBoxUpBtn = document.getElementById("moveBoxUpBtn");
const moveBoxDownBtn = document.getElementById("moveBoxDownBtn");
const deleteBoxBtn = document.getElementById("deleteBoxBtn");

function openManageBoxModal() {
  boxManageOverlay.classList.add("active");
  boxManageOverlay.setAttribute("aria-hidden", "false");
}

function closeManageBoxModal() {
  boxManageOverlay.classList.remove("active");
  boxManageOverlay.setAttribute("aria-hidden", "true");
}

async function moveSelectedBox(direction) {
  const boxId = boxManageForm.dataset.boxId;
  const response = await fetch(`/api/boxes/${boxId}/move`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({direction}),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    boxManageHint.textContent = data.error || "移动失败";
    boxManageHint.className = "error";
    return;
  }
  window.location.reload();
}

if (openManageBoxBtn) openManageBoxBtn.addEventListener("click", openManageBoxModal);
if (closeManageBoxBtn) closeManageBoxBtn.addEventListener("click", closeManageBoxModal);
if (boxManageOverlay) {
  boxManageOverlay.addEventListener("click", (event) => {
    if (event.target === boxManageOverlay) closeManageBoxModal();
  });
}

if (boxManageForm) {
  boxManageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const boxId = boxManageForm.dataset.boxId;
    const payload = {
      name: document.getElementById("manage-box-name").value,
      color: document.getElementById("manage-box-color").value,
      description: document.getElementById("manage-box-description").value,
    };
    const response = await fetch(`/api/boxes/${boxId}`, {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      boxManageHint.textContent = data.error || "保存失败";
      boxManageHint.className = "error";
      return;
    }
    window.location.reload();
  });
}

if (moveBoxUpBtn) moveBoxUpBtn.addEventListener("click", () => moveSelectedBox("up"));
if (moveBoxDownBtn) moveBoxDownBtn.addEventListener("click", () => moveSelectedBox("down"));

if (deleteBoxBtn) {
  deleteBoxBtn.addEventListener("click", async () => {
    const confirmed = window.confirm("删除这个盒子后，盒子里的全部卡片也会一起删除。确定继续吗？");
    if (!confirmed) return;

    const boxId = boxManageForm.dataset.boxId;
    const response = await fetch(`/api/boxes/${boxId}`, {method: "DELETE"});
    const data = await response.json();
    if (!response.ok || !data.success) {
      boxManageHint.textContent = data.error || "删除失败";
      boxManageHint.className = "error";
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("box_id");
    window.location.href = url.toString();
  });
}
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_selected_box_view_shows_management_entry_point -v`

Expected: PASS

- [ ] **Step 5: Run the relevant regression slice**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_app.TestAppCase.test_open_box_shows_box_contents_on_index tests.test_app.TestAppCase.test_update_box_api_updates_selected_box_fields tests.test_app.TestAppCase.test_move_box_api_reorders_boxes tests.test_app.TestAppCase.test_delete_box_api_removes_box_and_items tests.test_app.TestAppCase.test_selected_box_view_shows_management_entry_point -v`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add D:/02-Projects/brain/templates/index.html D:/02-Projects/brain/tests/test_app.py
git commit -m "add selected box management panel"
```

## Task 5: Run Full Verification

**Files:**
- Modify: `D:\02-Projects\brain\tests\test_app.py` if any assertions need final cleanup from previous tasks

- [ ] **Step 1: Run the full test suite**

Run: `.\.venv\Scripts\python.exe -m unittest discover -s tests -v`

Expected: PASS with all existing workbench tests and new box-management tests green.

- [ ] **Step 2: Manual smoke-check in the local app**

Run: `.\.venv\Scripts\python.exe app.py`

Expected:

- `http://localhost:5001` loads
- opening a box shows `管理这个盒子`
- save updates box info after reload
- `上移` and `下移` visibly reorder the rail
- delete confirmation removes the box and returns to inbox view

- [ ] **Step 3: Commit any final test or copy fixes**

```bash
git add D:/02-Projects/brain/brain_app/routes.py D:/02-Projects/brain/brain_app/services.py D:/02-Projects/brain/templates/index.html D:/02-Projects/brain/tests/test_app.py
git commit -m "finish box management panel flow"
```

## Self-Review

### Spec Coverage

- selected-box-only management entry: covered by Task 4
- rename, recolor, description editing: covered by Tasks 1, 3, and 4
- up/down ordering: covered by Tasks 1, 3, and 4
- destructive delete with cards removed too: covered by Tasks 2 and 3
- uploaded-file cleanup during delete: covered by Task 2
- readable validation and move errors: covered by Tasks 1 and 3
- missing-box API responses use `404`: covered by Task 3

No spec gaps remain for the approved box-management scope.

### Placeholder Scan

- no `TODO`
- no `TBD`
- each task includes exact test code, commands, and implementation snippets

### Type Consistency

Consistent names used throughout the plan:

- `update_box`
- `move_box`
- `delete_box`
- `/api/boxes/<id>`
- `/api/boxes/<id>/move`
- `boxManageOverlay`
- `boxManageForm`

These names are aligned across services, routes, tests, and template wiring.
