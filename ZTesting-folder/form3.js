async function getClassifiedForms() {
  const res = await fetch("https://a.klaviyo.com/api/forms", {
    method: "GET",
    headers: {
      "Authorization": "Klaviyo-API-Key pk_a31c0f1f124afc9e6b458a684e35e2e2dd",
      "accept": "application/vnd.api+json",
      "revision": "2024-10-15"
    }
  });

  const json = await res.json();

  json.data.forEach(form => {
    const id = form.id;
    const name = form.attributes.name.toLowerCase();

    // Device (name-based only)
    let device = name.includes("mobile") ? "MOBILE" : "DESKTOP";

    // Intent (name-based only)
    let intent = name.includes("exit") ? "EXIT INTENT" : "NORMAL";

    // Type (name-based only)
    let type = name.includes("flyout")
      ? "FLYOUT"
      : name.includes("embed")
      ? "EMBED"
      : "POPUP";

    console.log(`${id} -> ${device} | ${intent} | ${type}`);
  });
}

getClassifiedForms();
