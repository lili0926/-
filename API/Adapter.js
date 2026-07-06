async function callAI(messages){

    const config = JSON.parse(localStorage.getItem("aiConfig"));

    const res = await fetch("/api/proxy", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            ...config,
            messages
        })
    });

    return await res.json();
}
