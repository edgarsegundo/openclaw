export function sanitizeMarkdownHtml(md) {
  if (!md) {return "";}

  return md
    // CRLF → LF
    .replace(/\r\n/g, "\n")

    // remove linhas vazias com espaços
    .replace(/^[ \t]+$/gm, "")

    // remove indentação antes de HTML block
    .replace(/^\s+(<\/?(div|table|ul|ol|pre|blockquote)[\s>])/gim, "$1")

    // garante isolamento de blocos HTML
    .replace(/([^\n])(<(div|table|ul|ol|pre|blockquote))/gi, "$1\n\n$2")
    .replace(/(<\/(div|table|ul|ol|pre|blockquote)>)([^\n])/gi, "$1\n\n$3")

    // remove espaços após fechamento de tag
    .replace(/<\/(div|table|ul|ol|pre|blockquote)>\s+\n/gi, "</$1>\n")

    // normaliza múltiplas quebras
    .replace(/\n{3,}/g, "\n\n")

    // trim end
    .split("\n").map(line => line.trimEnd()).join("\n")

    // reduz espaços duplicados
    .replace(/ {2,}/g, " ")

    .trim();
}
