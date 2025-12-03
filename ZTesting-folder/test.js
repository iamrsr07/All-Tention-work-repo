async function debugForm(id) {
  const res = await fetch("https://a.klaviyo.com/api/forms/" + id, {
    method: "GET",
    headers: {
      "Authorization": "Klaviyo-API-Key pk_35fd93ac51fea6e118d7b83e817ba0fc87",
      "accept": "application/vnd.api+json",
      "revision": "2024-10-15"
    }
  });

  const json = await res.json();
  console.log(JSON.stringify(json.data.attributes, null, 2));
}

debugForm("T9rw36"); // <-- one form that should be mobile
