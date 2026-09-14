import os
from openai import OpenAI

def ask_ai(prompt: str) -> str:
# 1. Try Groq first
    try:
        from groq import Groq
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        r = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800,
            reasoning_effort="low",
        )
        content = r.choices[0].message.content
        if not content or not content.strip():
            raise ValueError("Groq returned empty content")
        return content
    except Exception as e:
        print("Groq failed:", e)
    # 2. Fall back to Cohere
    try:
        import cohere
        co = cohere.Client(os.getenv("COHERE_API_KEY"))
        r = co.chat(model="command-a-03-2025", message=prompt)
        return r.text
    except Exception as e:
        print("Cohere failed:", e)

    # 3. Fall back to Gemini
    try:
        from google import genai
        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        r = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
        )
        return r.text
    except Exception as e:
        print("Gemini failed:", e)

    # 4. Fall back to NVIDIA (nemotron) last
    try:
        client = OpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=os.getenv("NVIDIA_API_KEY"),
        )
        r = client.chat.completions.create(
            model="nvidia/nemotron-3.5-lightning-30b-a3b",
            messages=[
                {"role": "system", "content": "detailed thinking off"},
                {"role": "user", "content": prompt}
            ],
            max_tokens=500,
            temperature=0,
        )
        return r.choices[0].message.content
    except Exception as e:
        print("NVIDIA failed:", e)

    return "Sorry, AI is temporarily unavailable. Please try again shortly."