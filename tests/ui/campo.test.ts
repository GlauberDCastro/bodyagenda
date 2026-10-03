import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Campo, Input, Select } from "@/components/ui/primitivos";

const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(el);
const atributo = (markup: string, seletor: RegExp) => markup.match(seletor)?.[1];

describe("Campo", () => {
  it("o rótulo aponta para o campo, e a dica é anunciada junto", () => {
    const m = html(
      h(Campo, { label: "Nome", dica: "Como no documento", children: h(Input, { name: "nome" }) }),
    );
    const para = atributo(m, /<label for="([^"]+)"/);
    const id = atributo(m, /<input[^>]* id="([^"]+)"/);
    expect(para).toBeTruthy();
    expect(para).toBe(id);
    const descricao = atributo(m, /aria-describedby="([^"]+)"/);
    expect(m).toContain(`<p id="${descricao}"`);
  });

  it("erro marca o campo como inválido e é a descrição dele", () => {
    const m = html(
      h(Campo, { label: "CPF", erro: "CPF inválido", children: h(Input, { name: "cpf" }) }),
    );
    expect(m).toContain('aria-invalid="true"');
    const descricao = atributo(m, /aria-describedby="([^"]+)"/);
    expect(m).toMatch(new RegExp(`<p id="${descricao}" role="alert"`));
  });

  it("respeita o id que o campo já tem e ignora o input escondido", () => {
    const m = html(
      h(Campo, {
        label: "Sala",
        children: [
          h("input", { key: "o", type: "hidden", name: "sala_id", value: "x", readOnly: true }),
          h(Select, { key: "s", id: "sala", name: "sala_id" }),
        ],
      }),
    );
    expect(m).toContain('<label for="sala"');
    expect(m).not.toMatch(/type="hidden"[^>]* id=/);
  });

  it("lista de caixas de marcar vira um grupo nomeado pelo rótulo", () => {
    const m = html(
      h(Campo, {
        label: "Equipamentos",
        children: h("div", null, h("label", null, h("input", { type: "checkbox" }))),
      }),
    );
    expect(m).toContain('role="group"');
    const rotulo = atributo(m, /aria-labelledby="([^"]+)"/);
    expect(m).toContain(`<span id="${rotulo}"`);
    expect(m).not.toContain("<label for=");
  });
});
