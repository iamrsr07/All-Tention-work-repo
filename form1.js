async function getAllForms() {
  const res = await fetch("https://a.klaviyo.com/api/forms", {
    method: "GET",
    headers: {
      "Authorization": "Klaviyo-API-Key pk_cc2ab40378587ea855ec6206535f0a5f5f",
      "accept": "application/vnd.api+json",
      "revision": "2024-10-15"
    }
  });

  const data = await res.json();

  data.data.forEach(form => {
    console.log(
      form.id,
      "|",
      form.attributes.name
    );
  });
}

getAllForms();
