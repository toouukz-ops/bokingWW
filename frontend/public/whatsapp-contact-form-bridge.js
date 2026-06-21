(() => {
  if (window.__GPB_WHATSAPP_CONTACT_FORM_BRIDGE__) return;
  window.__GPB_WHATSAPP_CONTACT_FORM_BRIDGE__ = true;

  const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const isVisible = (element) => {
    const rect = element?.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  };
  const isGpb = (element) => Boolean(element?.closest?.("#gpb-booking-extension-root"));
  const phoneFromText = (text) => {
    const match = String(text || "").match(/(?:\+?\d[\s().-]*){10,16}/);
    return match ? match[0].replace(/[^\d+]/g, "") : "";
  };
  const digitsOnly = (value) => String(value || "").replace(/\D/g, "");
  const phoneMatches = (value, expected) => {
    const actualDigits = digitsOnly(value);
    const expectedDigits = digitsOnly(expected);
    if (!expectedDigits) return true;
    return actualDigits === expectedDigits || actualDigits.endsWith(expectedDigits.slice(-10));
  };
  const getValue = (field) => {
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) return field.value || "";
    return field.textContent || "";
  };
  const isFillableField = (field) => {
    if (field instanceof HTMLInputElement) {
      return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(field.type);
    }
    return true;
  };
  const getFieldText = (field) => [
    field.getAttribute("aria-label"),
    field.getAttribute("placeholder"),
    field.getAttribute("data-lexical-placeholder"),
    field.getAttribute("name"),
    field.id,
    getValue(field)
  ].filter(Boolean).join(" ");
  const isNameLikeField = (field) => {
    const value = getValue(field);
    const text = getFieldText(field);
    return !phoneFromText(value) && !/фамилия|last|страна|country|код|code|телефон|phone|mobile|номер/i.test(text);
  };

  function findContactFormPanel() {
    const candidates = Array.from(document.querySelectorAll('[data-testid*="drawer"], [data-testid*="panel"], [role="dialog"], aside, section, div'))
      .filter((element) => isVisible(element) && !isGpb(element));

    return candidates
      .sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left)
      .reverse()
      .find((element) => /новый\s+контакт|редактировать\s+контакт|изменить\s+контакт|new\s+contact|edit\s+contact/i.test(element.innerText || element.getAttribute("aria-label") || "")) || null;
  }

  function isInsideSamePanel(element, root) {
    const rootRect = root.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return rect.left >= rootRect.left - 32 &&
      rect.left <= rootRect.right + 160 &&
      rect.top >= rootRect.top - 24 &&
      rect.top <= window.innerHeight - 16;
  }

  function getContactFormFields(root) {
    const scopedFields = Array.from(root.querySelectorAll("input, textarea, [contenteditable='true'], [role='textbox']"))
      .filter((element) => isVisible(element) && !isGpb(element) && isFillableField(element));
    if (scopedFields.length) return scopedFields;

    const panelFields = Array.from(document.querySelectorAll("input, textarea, [contenteditable='true'], [role='textbox']"))
      .filter((element) => isVisible(element) && !isGpb(element) && isFillableField(element) && isInsideSamePanel(element, root))
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return leftRect.top - rightRect.top || leftRect.left - rightRect.left;
      });
    if (panelFields.length) return panelFields;

    return Array.from(document.querySelectorAll("input, textarea, [contenteditable='true'], [role='textbox']"))
      .filter((element) => {
        if (!isVisible(element) || isGpb(element) || !isFillableField(element)) return false;
        if (element.closest("footer, #main footer")) return false;
        const rect = element.getBoundingClientRect();
        return rect.top > 50 && rect.top < window.innerHeight - 140 && rect.width > 80;
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return leftRect.top - rightRect.top || leftRect.left - rightRect.left;
      });
  }

  function findFieldByLabel(root, fields, pattern) {
    const labels = Array.from(document.querySelectorAll("span, div, label"))
      .filter((element) => isVisible(element) && !isGpb(element) && isInsideSamePanel(element, root) && pattern.test(cleanText(element.textContent)))
      .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);

    for (const label of labels) {
      const labelRect = label.getBoundingClientRect();
      const field = fields
        .filter((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return rect.top >= labelRect.top - 10 &&
            rect.top <= labelRect.bottom + 54 &&
            rect.left >= labelRect.left - 24 &&
            rect.left <= labelRect.right + 420;
        })
        .sort((left, right) => Math.abs(left.getBoundingClientRect().top - labelRect.top) - Math.abs(right.getBoundingClientRect().top - labelRect.top))[0];
      if (field) return field;
    }

    return null;
  }

  function findNameField(root, fields) {
    const active = document.activeElement;
    if (active && root.contains(active) && fields.includes(active) && isNameLikeField(active)) return active;

    const byLabel = findFieldByLabel(root, fields, /^(имя|name|first name)$/i);
    if (byLabel) return byLabel;

    const rootRect = root.getBoundingClientRect();
    return fields
      .filter((field) => {
        const rect = field.getBoundingClientRect();
        return rect.top > rootRect.top + 45 && rect.top < rootRect.top + 260 && isNameLikeField(field);
      })
      .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)[0] || null;
  }

  function isPhoneLikeField(field) {
    const text = getFieldText(field);
    return Boolean(phoneFromText(getValue(field)) || /страна|country|код|code|телефон|phone|mobile|номер/i.test(text));
  }

  function findLastNameFields(root, fields, nameField) {
    const found = new Set();
    const byLabel = findFieldByLabel(root, fields, /^(фамилия|last name|last|surname)$/i);
    if (byLabel && byLabel !== nameField && !isPhoneLikeField(byLabel)) found.add(byLabel);

    const rootRect = root.getBoundingClientRect();
    const nameRect = nameField?.getBoundingClientRect?.();
    const phoneField = findPhoneField(root, fields);
    const phoneTop = phoneField?.getBoundingClientRect?.().top ?? rootRect.top + 420;
    const candidates = fields
      .filter((field) => {
        if (field === nameField || field === phoneField) return false;
        const rect = field.getBoundingClientRect();
        if (!nameRect || rect.top <= nameRect.bottom + 8) return false;
        if (rect.top >= phoneTop - 8) return false;
        if (rect.top < rootRect.top + 80 || rect.top > rootRect.top + 360) return false;
        return !isPhoneLikeField(field);
      })
      .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);

    for (const field of candidates) found.add(field);
    return Array.from(found);
  }

  async function clearLastNameFields(root, fields, nameField) {
    const lastNameFields = findLastNameFields(root, fields, nameField);
    const values = [];
    for (const field of lastNameFields) {
      await setFieldValueRepeated(field, "");
      const value = getValue(field);
      if (cleanText(value)) {
        selectAllLikeUser(field);
        document.execCommand("delete", false);
        fireInput(field, null, "deleteContentBackward");
      }
      values.push(getValue(field));
    }
    return values;
  }

  function findPhoneField(root, fields) {
    const labelFields = Array.from(document.querySelectorAll("span, div, label"))
      .filter((element) => isVisible(element) && !isGpb(element) && isInsideSamePanel(element, root) && /^(телефон|phone|mobile|номер)$/i.test(cleanText(element.textContent)))
      .flatMap((label) => {
        const labelRect = label.getBoundingClientRect();
        return fields
          .filter((candidate) => {
            const rect = candidate.getBoundingClientRect();
            const text = getFieldText(candidate);
            return !/страна|country|код|code/i.test(text) &&
              rect.top >= labelRect.top - 12 &&
              rect.top <= labelRect.bottom + 64 &&
              rect.left >= labelRect.left - 24;
          })
          .sort((left, right) => right.getBoundingClientRect().left - left.getBoundingClientRect().left);
      });
    if (labelFields[0]) return labelFields[0];

    const byLabel = findFieldByLabel(root, fields, /телефон|phone|mobile|номер/i);
    if (byLabel && !/страна|country|код|code/i.test(getFieldText(byLabel))) return byLabel;

    return fields
      .filter((field) => {
        const text = getFieldText(field);
        if (/страна|country|код|code|имя|name|first|фамилия|last/i.test(text)) return false;
        const rect = field.getBoundingClientRect();
        return rect.top > root.getBoundingClientRect().top + 180;
      })
      .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)
      .at(-1) || null;
  }

  function fireInput(field, value, inputType = "insertText") {
    field.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType, data: value }));
    field.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  }

  function selectFieldContents(field) {
    field.focus();

    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      if (typeof field.select === "function") field.select();
      if (typeof field.setSelectionRange === "function") field.setSelectionRange(0, field.value.length);
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(field);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function dispatchKey(field, type, init) {
    field.dispatchEvent(new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      ...init
    }));
  }

  function selectAllLikeUser(field) {
    field.focus();
    dispatchKey(field, "keydown", { key: "a", code: "KeyA", metaKey: true });
    dispatchKey(field, "keyup", { key: "a", code: "KeyA", metaKey: true });
    dispatchKey(field, "keydown", { key: "a", code: "KeyA", ctrlKey: true });
    dispatchKey(field, "keyup", { key: "a", code: "KeyA", ctrlKey: true });
    document.execCommand("selectAll", false);
    selectFieldContents(field);
  }

  function pasteTextLikeUser(field, value) {
    selectAllLikeUser(field);

    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", value);
    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer
    });
    field.dispatchEvent(pasteEvent);
    return cleanText(getValue(field)) === value;
  }

  function setFieldValue(field, value) {
    field.focus();
    if (cleanText(getValue(field)) === value) return true;

    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value") ||
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value") ||
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");

      selectFieldContents(field);
      descriptor?.set?.call(field, "");
      field.value = "";
      fireInput(field, null, "deleteContentBackward");

      descriptor?.set?.call(field, value);
      field.value = value;
      fireInput(field, value, "insertReplacementText");
      if (field.value !== value) {
        pasteTextLikeUser(field, value);
        descriptor?.set?.call(field, value);
        field.value = value;
        fireInput(field, value, "insertText");
      }
      return field.value === value;
    }

    selectAllLikeUser(field);
    document.execCommand("delete", false);
    fireInput(field, null, "deleteContentBackward");
    return pasteTextLikeUser(field, value);
  }

  async function setFieldValueRepeated(field, value) {
    if (setFieldValue(field, value)) return true;
    await new Promise((resolve) => setTimeout(resolve, 180));
    return getValue(field).trim() === value;
  }

  window.addEventListener("gpb-fill-contact-form", async (event) => {
    const detail = event.detail || {};
    const requestId = detail.requestId || "";
    const name = cleanText(detail.name);
    const phone = cleanText(detail.phone);
    const fillPhone = detail.fillPhone !== false;
    let ok = false;
    let reason = "";
    let nameValue = "";
    let phoneValue = "";
    let lastNameValues = [];

    try {
      const root = findContactFormPanel();
      if (!root) throw new Error("contact form not found");

      const fields = getContactFormFields(root);
      if (!fields.length) throw new Error("fields not found");

      const nameField = findNameField(root, fields);
      if (!nameField) throw new Error("name field not found");
      nameField.style.outline = "3px solid #f59e0b";
      nameField.style.boxShadow = "0 0 0 4px rgba(245,158,11,.25)";
      const nameOk = await setFieldValueRepeated(nameField, name);
      nameValue = getValue(nameField);

      lastNameValues = await clearLastNameFields(root, fields, nameField);

      let phoneOk = true;
      if (fillPhone && phone) {
        const phoneField = findPhoneField(root, fields);
        if (!phoneField) throw new Error("phone field not found");
        phoneOk = await setFieldValueRepeated(phoneField, phone);
        phoneValue = getValue(phoneField);
        phoneOk = Boolean(phoneOk && phoneMatches(phoneValue, phone));
      }

      ok = Boolean(nameOk && phoneOk);
      reason = ok ? "" : "field value mismatch";
    } catch (error) {
      reason = error?.message || "unknown error";
    }

    window.dispatchEvent(new CustomEvent("gpb-contact-form-filled", {
      detail: { requestId, ok, reason, nameValue, phoneValue, lastNameValues }
    }));
  });
})();
