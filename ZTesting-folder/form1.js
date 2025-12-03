async function getAllForms() {
  const res = await fetch("https://a.klaviyo.com/api/forms", {
    method: "GET",
    headers: {
      "Authorization": "Klaviyo-API-Key pk_35fd93ac51fea6e118d7b83e817ba0fc87",
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
