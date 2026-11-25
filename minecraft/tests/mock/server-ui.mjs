// @minecraft/server-ui のテスト用モック
// フォームが表示されると __ui.responder(form, player) の戻り値が応答になる。
export const FormCancelationReason = { UserBusy: "UserBusy", UserClosed: "UserClosed" };

export const __ui = {
  shown: [],
  /** @type {(form: any, player: any) => any} */
  responder: () => ({ canceled: true, cancelationReason: "UserClosed" }),
};

class BaseForm {
  constructor(type) {
    this.type = type;
    this._title = "";
    this._body = "";
    this.buttons = [];
    this.controls = [];
  }
  title(t) {
    this._title = t;
    return this;
  }
  body(t) {
    this._body = t;
    return this;
  }
  async show(player) {
    __ui.shown.push({ form: this, player: player.name });
    return __ui.responder(this, player);
  }
}

export class ActionFormData extends BaseForm {
  constructor() {
    super("action");
  }
  button(text, icon) {
    this.buttons.push({ text, icon });
    return this;
  }
  divider() {
    return this;
  }
  header() {
    return this;
  }
  label() {
    return this;
  }
}

export class ModalFormData extends BaseForm {
  constructor() {
    super("modal");
  }
  dropdown(label, items, opt) {
    this.controls.push({ kind: "dropdown", label, items, defaultValue: opt?.defaultValueIndex });
    return this;
  }
  textField(label, placeholder, opt) {
    this.controls.push({ kind: "textField", label, defaultValue: opt?.defaultValue });
    return this;
  }
  toggle(label, opt) {
    this.controls.push({ kind: "toggle", label, defaultValue: opt?.defaultValue });
    return this;
  }
  label(text) {
    this.controls.push({ kind: "label", label: text });
    return this;
  }
  submitButton() {
    return this;
  }
}

export class MessageFormData extends BaseForm {
  constructor() {
    super("message");
  }
  button1(t) {
    this.buttons[0] = { text: t };
    return this;
  }
  button2(t) {
    this.buttons[1] = { text: t };
    return this;
  }
}
