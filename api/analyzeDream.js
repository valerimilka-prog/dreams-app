module.exports = async function(req, res) {
    // Блокуємо будь-які запити, крім POST (захист від випадкових переходів)
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        // У Vercel дані (req.body) вже розпаковані
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { text, emotion, real } = body;

        // Беремо секретний ключ з налаштувань Vercel (Environment Variables)
        const apiKey = process.env.GEMINI_API_KEY; 

        if (!apiKey) {
            return res.status(500).json({ error: "Ключ API не знайдено на сервері" });
        }

        // Формуємо наш ідеальний юнгіанський промпт
        const promptText = `Ти — юнгіанський аналітик, який зараз сидить навпроти людини і веде ОСОБИСТУ бесіду.
        Звертайся до людини ВИКЛЮЧНО на "Ви" (Ваш сон, Ви відчуваєте, Вам варто). 
        КАТЕГОРИЧНО ЗАБОРОНЕНО використовувати слова "клієнт", "сновидиця", "вона" чи писати про неї в третій особі.
        
        Сон: "${text}". Емоція: "${emotion}". Реальність: "${real}".
        Відповідь має бути ЛИШЕ у форматі JSON, українською мовою:
        {
          "archetype": "Головний архетип (дуже коротко)",
          "analysis": "Аналіз сну (Пиши строго на 'Ви': 'Ваш сон показує Вам...', 2 абзаци)",
          "compensation": "Компенсація (Пиши строго на 'Ви': 'Ваша психіка намагається...', 1 абзац)",
          "action": "Порада (Пиши строго на 'Ви': 'Вам варто зробити...', 1 абзац)"
        }`;

        // Робимо безпечний запит до Google Gemini з резервним копіюванням
        let response;
        try {
            // Спроба 1: Основна модель 3.5 (твій оригінальний вибір)
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: "Проаналізуй цей текст: " + promptText }] }],
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ]
                })
            });
            
            // Якщо сервер повернув помилку (наприклад 503), кидаємо виняток, щоб спрацював резерв
            if (!response.ok) {
                throw new Error(`Помилка основної моделі: ${response.status}`);
            }
        } catch (primaryError) {
            console.warn("Основна модель 3.5 перевантажена, перемикаємось на страхуючу 3.1...", primaryError);
            
            // Спроба 2: Резервна модель 3.1 (твій оригінальний вибір)
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: "Проаналізуй цей текст: " + promptText }] }],
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ]
                })
            });
        }

        const data = await response.json();

        // Перевірка на блокування безпеки
        if (data.promptFeedback && data.promptFeedback.blockReason) {
            return res.status(400).json({ error: "BLOCKED_BY_SAFETY" });
        }

        let aiText = data.candidates[0].content.parts[0].text;
        aiText = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        // Віддаємо готовий результат назад на сторінку
        res.setHeader("Content-Type", "application/json");
        return res.status(200).send(aiText);

    } catch (error) {
        console.error("ДЕТАЛІ ПОМИЛКИ:", error);
        return res.status(500).json({ error: "Помилка сервера при обробці запиту." });
    }
};
