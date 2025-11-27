const KLAIVYA_API_URL = "https://api.klaivya.com/signup-metrics";
const API_KEY = "pk_5656f025641fe415c1309909a1adae8120";

async function checkSignupRate() {
  try {
    const response = await fetch(KLAIVYA_API_URL, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${API_KEY}`
      }
    });

    const data = await response.json();

    const signups = data.signups;
    const visitors = data.visitors;

    const signup_rate = (signups / visitors) * 100;

    console.log("Signup Rate:", signup_rate);
  } catch (err) {
    console.error("Error:", err);
  }
}

checkSignupRate();
