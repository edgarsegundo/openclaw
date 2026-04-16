## Como chamar um endpont do `msitesapp`

```js
/**
 * POSTs the article payload to the blog API.
 * Returns true on success, false on failure.
 */
async function postArticle(payload, apiKey) {
  try {
    const { default: fetch } = await import("node-fetch");
    const res = await fetch("http://localhost:3900/blog-article", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`POST failed: ${res.status} ${body}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`POST error: ${err.message}`);
    return false;
  }
}
```
