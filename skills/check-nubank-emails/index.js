// ==============================
// CONFIG
// ==============================
const USE_MOCK = true; // 👈 TROQUE PARA false PARA USAR GMAIL

// ==============================
// MOCK EMAIL (RAW)
// ==============================
const MOCK_EMAIL_RAW = `
Subject: Você recebeu uma transferência pelo Pix
From: Nubank <todomundo@nubank.com.br>

Transferência recebida

Você recebeu uma transferência pelo Pix de GOBBI PAVAN EDUCACAO LTDA

Valor recebido
R$ 852,00

26 DEZ às 17:02
`;

// ==============================
// MAIN
// ==============================
export default async function checkNubankEmails({ gmail, log, state }) {
  try {
    log("🔍 Checking Nubank emails...");

    let emails = [];

    // ==============================
    // MODO MOCK
    // ==============================
    if (USE_MOCK) {
      log("🧪 Using MOCK email");

      emails = [
        {
          id: "mock-email-1",
          raw: MOCK_EMAIL_RAW,
        },
      ];
    }

    // ==============================
    // MODO REAL (GMAIL)
    // ==============================
    else {
      const query = "from:todomundo@nubank.com.br is:unread";

      emails = await gmail.search({ query });

      if (!emails || emails.length === 0) {
        log("📭 No new emails");
        return { processed: 0 };
      }

      emails = emails.slice(0, 5);
    }

    let processed = 0;

    for (const email of emails) {
      try {
        // evitar duplicação
        if (state.get(email.id)) {
          continue;
        }

        let body = "";

        // ==============================
        // MOCK
        // ==============================
        if (USE_MOCK) {
          body = email.raw;
        }

        // ==============================
        // GMAIL
        // ==============================
        else {
          const fullEmail = await gmail.get(email.id);
          body = extractBody(fullEmail);
        }

        if (!body) {
          log(`⚠️ Empty body for email ${email.id}`);
          continue;
        }

        // parse
        const parsed = parseNubankEmail(body);

        // salvar (mock)
        log("💾 Parsed email:", JSON.stringify(parsed, null, 2));

        // marcar processado
        state.set(email.id, true);

        // marcar como lido (somente real)
        if (!USE_MOCK) {
          await gmail.markAsRead(email.id);
        }

        processed++;
      } catch (err) {
        log(`❌ Error processing email ${email.id}:`, err);
      }
    }

    log(`✅ Finished. Processed ${processed} emails`);

    return { processed };
  } catch (error) {
    log("❌ Fatal error:", error);
    throw error;
  }
}

// ==============================
// EXTRAÇÃO (GMAIL)
// ==============================
function extractBody(email) {
  try {
    const payload = email.payload;

    if (!payload) return "";

    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          return decodeBase64(part.body.data);
        }
      }

      for (const part of payload.parts) {
        if (part.mimeType === "text/html" && part.body?.data) {
          return decodeBase64(part.body.data);
        }
      }
    }

    if (payload.body?.data) {
      return decodeBase64(payload.body.data);
    }

    return "";
  } catch {
    return "";
  }
}

// ==============================
// BASE64
// ==============================
function decodeBase64(data) {
  if (!data) return "";

  return Buffer.from(data, "base64").toString("utf-8").replace(/\r\n/g, "\n");
}

// ==============================
// PARSER NUBANK
// ==============================
function parseNubankEmail(body) {
  try {
    // valor
    const valorMatch = body.match(/R\$\s?([\d.,]+)/);

    // data (formato simples)
    const dataMatch = body.match(/\d{1,2}\s[A-Z]{3}\sàs\s\d{2}:\d{2}/i);

    // nome de quem enviou
    const senderMatch = body.match(/Pix de\s(.+?)(\n|$)/i);

    return {
      valor: valorMatch ? valorMatch[1] : null,
      data: dataMatch ? dataMatch[0] : null,
      remetente: senderMatch ? senderMatch[1].trim() : null,
      raw_preview: body.slice(0, 200),
    };
  } catch {
    return {
      valor: null,
      data: null,
      remetente: null,
      raw_preview: "",
    };
  }
}
