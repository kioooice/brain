import type { AiOrganizationResult, AiOrganizationSuggestion, Box, Item, WorkbenchSnapshot } from "../shared/types";
import { redactSensitiveText } from "../shared/sensitive-redaction";
import { readAiProviderConfig } from "./ai-config";
import type { DesktopStore } from "./store";

const MAX_ITEMS_PER_REQUEST = 30;
const MAX_TEXT_CHARS = 700;
const MAX_TITLE_CHARS = 80;
const MAX_REASON_CHARS = 120;

type RawAiSuggestion = {
  itemId?: unknown;
  suggestedTitle?: unknown;
  targetBoxName?: unknown;
  confidence?: unknown;
  reason?: unknown;
};

type RawAiPayload = {
  suggestions?: RawAiSuggestion[];
};

function truncate(value: string, maxLength: number) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}...` : trimmed;
}

function normalizeBoxName(value: string) {
  return truncate(value, 24);
}

function getExistingBoxByName(boxes: Box[], name: string) {
  const normalized = name.trim().toLowerCase();
  return boxes.find((box) => box.name.trim().toLowerCase() === normalized) ?? null;
}

function getItemSummary(item: Item) {
  if (item.kind === "image") {
    return item.content.startsWith("data:image/") ? "[图片内容，未发送原始图片数据]" : truncate(item.content, MAX_TEXT_CHARS);
  }

  if (item.kind === "file") {
    return truncate(item.sourcePath || item.content || item.title, MAX_TEXT_CHARS);
  }

  if (item.kind === "link") {
    return truncate(item.sourceUrl || item.content || item.title, MAX_TEXT_CHARS);
  }

  if (item.kind === "bundle") {
    return `组合卡片，包含 ${item.bundleCount} 个项目`;
  }

  return truncate(item.content || item.title, MAX_TEXT_CHARS);
}

function buildPromptPayload(snapshot: WorkbenchSnapshot, boxId: number) {
  const sourceBox = snapshot.boxes.find((box) => box.id === boxId) ?? null;
  const items = snapshot.items
    .filter((item) => item.boxId === boxId && item.bundleParentId == null)
    .slice(0, MAX_ITEMS_PER_REQUEST)
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      content: getItemSummary(item),
      sourceUrl: item.sourceUrl,
      sourcePath: item.sourcePath,
      createdAt: item.createdAt,
    }));

  return {
    sourceBox: sourceBox ? { id: sourceBox.id, name: sourceBox.name } : null,
    boxes: snapshot.boxes.map((box) => ({ id: box.id, name: box.name, description: box.description })),
    items,
  };
}

function getDeepSeekChatCompletionsUrl(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  return `${normalizedBaseUrl || "https://api.deepseek.com"}/chat/completions`;
}

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const response = payload as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

function parseJsonObject(text: string): RawAiPayload {
  try {
    return JSON.parse(text) as RawAiPayload;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("AI 返回的内容不是 JSON");
    }
    return JSON.parse(match[0]) as RawAiPayload;
  }
}

function sanitizeSuggestions(snapshot: WorkbenchSnapshot, boxId: number, rawSuggestions: RawAiSuggestion[]) {
  const sourceItems = new Map(snapshot.items.filter((item) => item.boxId === boxId).map((item) => [item.id, item]));
  const suggestions: AiOrganizationSuggestion[] = [];
  const seen = new Set<number>();

  for (const raw of rawSuggestions) {
    const itemId = Number(raw.itemId);
    const item = sourceItems.get(itemId);
    if (!item || seen.has(itemId)) {
      continue;
    }

    const targetBoxName =
      typeof raw.targetBoxName === "string" && raw.targetBoxName.trim()
        ? normalizeBoxName(raw.targetBoxName)
        : snapshot.boxes.find((box) => box.id === item.boxId)?.name ?? "收件箱";
    const existingTargetBox = getExistingBoxByName(snapshot.boxes, targetBoxName);
    const suggestedTitle =
      typeof raw.suggestedTitle === "string" && raw.suggestedTitle.trim()
        ? truncate(raw.suggestedTitle, MAX_TITLE_CHARS)
        : item.title;
    const reason =
      typeof raw.reason === "string" && raw.reason.trim()
        ? truncate(raw.reason, MAX_REASON_CHARS)
        : "根据内容和现有盒子名称判断";
    const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0.5));

    suggestions.push({
      itemId,
      suggestedTitle,
      targetBoxId: existingTargetBox?.id ?? null,
      targetBoxName,
      createBox: !existingTargetBox,
      confidence,
      reason,
    });
    seen.add(itemId);
  }

  return suggestions;
}

export async function suggestAiOrganization(store: DesktopStore, boxId: number): Promise<AiOrganizationResult> {
  const aiConfig = readAiProviderConfig();
  const apiKey = aiConfig.apiKey;
  if (!apiKey) {
    return {
      ok: false,
      reason: "缺少 DeepSeek API Key，请在关于界面配置。",
      suggestions: [],
    };
  }

  const snapshot = store.getWorkbenchSnapshot();
  const sourceBox = snapshot.boxes.find((box) => box.id === boxId);
  if (!sourceBox) {
    return { ok: false, reason: "没有找到要整理的盒子。", suggestions: [] };
  }

  const sourceItems = snapshot.items.filter((item) => item.boxId === boxId && item.bundleParentId == null);
  if (sourceItems.length === 0) {
    return { ok: false, reason: "这个盒子里还没有可整理的卡片。", suggestions: [] };
  }

  const model = aiConfig.model;
  const promptPayload = buildPromptPayload(snapshot, boxId);

  try {
    const response = await fetch(getDeepSeekChatCompletionsUrl(aiConfig.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              '你是 Brain 本地收集工作台的整理助手。只返回 JSON，不要解释。根据现有盒子和卡片内容，建议卡片归类和更清晰的标题。不要建议删除内容，不要输出敏感信息。JSON 格式必须是 {"suggestions":[{"itemId":数字,"suggestedTitle":"标题","targetBoxName":"盒子名","confidence":0到1,"reason":"原因"}]}。',
          },
          {
            role: "user",
            content: JSON.stringify(promptPayload),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      const safeMessage = redactSensitiveText(message, [apiKey]);
      return {
        ok: false,
        reason: `DeepSeek 整理失败：${response.status}${safeMessage ? ` ${truncate(safeMessage, 160)}` : ""}`,
        model,
        suggestions: [],
      };
    }

    const payload = (await response.json()) as unknown;
    const parsed = parseJsonObject(extractResponseText(payload));
    const suggestions = sanitizeSuggestions(snapshot, boxId, parsed.suggestions ?? []);

    return {
      ok: true,
      reason: suggestions.length > 0 ? "已生成整理建议。" : "AI 没有找到需要调整的卡片。",
      model,
      suggestions,
    };
  } catch (cause) {
    const safeReason =
      cause instanceof Error ? redactSensitiveText(cause.message, [apiKey]) : "AI 整理失败。";
    return {
      ok: false,
      reason: safeReason,
      model,
      suggestions: [],
    };
  }
}
