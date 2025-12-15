async function getAllForms() {
  const res = await fetch("https://a.klaviyo.com/api/forms", {
    method: "GET",
    headers: {
      "Authorization": "Klaviyo-API-Key pk_ddd7e941138ecd1edfd0f31c7826dc5835",
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
