// Notification Hub 自訂錯誤類
// 使用 extends Error + 指定 name 方便 instanceof 判斷 + log 辨識

export class NotificationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "NotificationError";
  }
}

/** 單一通路送出失敗（retry 3 次後仍敗）*/
export class ChannelSendError extends NotificationError {
  constructor(
    message: string,
    public readonly channelCode: string,
    public readonly targetRef: string,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = "ChannelSendError";
  }
}

/** 找不到對應的模板（DB 與 code registry 都沒有）*/
export class TemplateNotFoundError extends NotificationError {
  constructor(eventCode: string, channelCode: string) {
    super(`找不到模板：event=${eventCode} channel=${channelCode}`);
    this.name = "TemplateNotFoundError";
  }
}

/** 環境變數驗證失敗（zod parse error 包裝）*/
export class NotificationEnvError extends NotificationError {
  constructor(message: string, cause?: unknown) {
    super(`Notification env 設定錯誤：${message}`, cause);
    this.name = "NotificationEnvError";
  }
}
