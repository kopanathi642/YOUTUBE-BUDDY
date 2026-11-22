// Mark authored interface copy at build time. Project names, scripts and editable values stay in their original language.
export default function interfaceLabels({ types: t }) {
  return {
    visitor: {
      Program: {
        enter(path, state) {
          state.message = path.scope.generateUidIdentifier("InterfaceText");
          state.used = false;
        },
        exit(path, state) {
          if (state.used) path.unshiftContainer("body", t.importDeclaration([
            t.importSpecifier(state.message, t.identifier("InterfaceText")),
          ], t.stringLiteral("/src/interfaceLanguage")));
        },
      },
      JSXText(path, state) {
        const parent = path.parent.openingElement?.name?.name;
        if (!parent || (/^[A-Z]/.test(parent) && !["Link", "NavLink"].includes(parent))) return;
        if (["option", "textarea", "script", "style", "code", "pre", "svg", "title"].includes(parent)) return;
        const value = path.node.value.split(/\r?\n/).map((line, i, lines) => {
          let text = line.replace(/\t/g, " ");
          if (i) text = text.trimStart();
          if (i < lines.length - 1) text = text.trimEnd();
          return text;
        }).filter(Boolean).join(" ");
        if (!/[A-Za-z]{2}/.test(value)) return;
        state.used = true;
        const name = t.jsxIdentifier(state.message.name);
        path.replaceWith(t.jsxElement(t.jsxOpeningElement(name, [
          t.jsxAttribute(t.jsxIdentifier("source"), t.jsxExpressionContainer(t.stringLiteral(value))),
        ], true), null, [], true));
      },
    },
  };
}
