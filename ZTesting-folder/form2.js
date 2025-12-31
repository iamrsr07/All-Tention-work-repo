async function getClassifiedForms() {
  const res = await fetch("https://a.klaviyo.com/api/forms", {
    method: "GET",
    headers: {
      "Authorization": "Klaviyo-API-Key pk_d4730ae82f00792fc4db523007a3f48dc4",
      "accept": "application/vnd.api+json",
      "revision": "2024-10-15"
    }
  });

  const data = await res.json();

  data.data.forEach(form => {
    const id = form.id;
    const name = form.attributes.name.toLowerCase();

    let device = name.includes("mobile") ? "MOBILE" : "DESKTOP";
    let intent = name.includes("exit") ? "EXIT INTENT" : "NORMAL";
    let type = "POPUP"; // (your names show all are popup)

    console.log(`${id} -> ${device} ${intent} ${type}`);
  });
}

getClassifiedForms();
