// 共用模板工具
// Ducati 紅 #CC0000 為主色；Google Chat 用近似色

export const DUCATI_RED = "#CC0000";
export const TONE_WARNING = "#F59E0B";
export const TONE_SUCCESS = "#16A34A";
export const TONE_INFO = "#2563EB";

export interface FlexCardSpec {
  emoji: string;
  title: string;
  subtitle?: string;
  headerColor?: string;
  fields: Array<{ label: string; value: string }>;
  actionLabel?: string;
  actionUrl?: string;
  altText?: string;
}

export function buildLineFlex(spec: FlexCardSpec) {
  const alt = spec.altText ?? `${spec.emoji} ${spec.title}`;
  const headerColor = spec.headerColor ?? DUCATI_RED;

  return {
    type: "flex",
    altText: alt,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerColor,
        paddingAll: "lg",
        contents: [
          {
            type: "text",
            text: `${spec.emoji} DealerOS`,
            color: "#FFFFFF",
            size: "xs",
            weight: "bold",
          },
          {
            type: "text",
            text: spec.title,
            color: "#FFFFFF",
            weight: "bold",
            size: "lg",
            wrap: true,
            margin: "sm",
          },
          ...(spec.subtitle
            ? [{
                type: "text",
                text: spec.subtitle,
                color: "#FFFFFFCC",
                size: "xs",
                wrap: true,
                margin: "xs",
              }]
            : []),
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: spec.fields.map((f) => ({
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: f.label, color: "#888888", size: "sm", flex: 2 },
            { type: "text", text: f.value || "—", size: "sm", flex: 5, wrap: true },
          ],
        })),
      },
      ...(spec.actionUrl && spec.actionLabel
        ? {
            footer: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "button",
                  style: "primary",
                  color: headerColor,
                  action: {
                    type: "uri",
                    label: spec.actionLabel,
                    uri: spec.actionUrl,
                  },
                },
              ],
            },
          }
        : {}),
    },
  };
}

export function buildGoogleCard(spec: FlexCardSpec) {
  const header: Record<string, unknown> = {
    title: `${spec.emoji} ${spec.title}`,
  };
  if (spec.subtitle) header.subtitle = spec.subtitle;

  const fieldWidgets = spec.fields.map((f) => ({
    decoratedText: { topLabel: f.label, text: f.value || "—" },
  }));

  const widgets: unknown[] = [...fieldWidgets];
  if (spec.actionUrl && spec.actionLabel) {
    widgets.push({
      buttonList: {
        buttons: [
          {
            text: spec.actionLabel,
            onClick: { openLink: { url: spec.actionUrl } },
          },
        ],
      },
    });
  }

  return {
    cardsV2: [
      {
        cardId: `dealeros-${Date.now()}`,
        card: {
          header,
          sections: [{ widgets }],
        },
      },
    ],
  };
}

/** payload 欄位讀取 + fallback */
export function s(payload: Record<string, unknown>, key: string, fallback = ""): string {
  const v = payload[key];
  if (v === null || v === undefined) return fallback;
  return String(v);
}

/** 把 DB 內的 body JSONB（含 {{var}} 字面量）做變數插值 */
export function renderDbTemplate(
  body: unknown,
  payload: Record<string, unknown>,
): unknown {
  if (typeof body === "string") {
    return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => {
      return s(payload, k, `{{${k}}}`);
    });
  }
  if (Array.isArray(body)) return body.map((x) => renderDbTemplate(x, payload));
  if (body && typeof body === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      out[k] = renderDbTemplate(v, payload);
    }
    return out;
  }
  return body;
}
