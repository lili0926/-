export default async function handler(req, res) {
  try {
    const { url, headers, body } = req.body;

    if (!url) {
      return res.status(400).json({
        error: "missing url"
      });
    }

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    });

    const data = await response.json();

    res.status(200).json(data);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
}
