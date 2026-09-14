import os
import requests
from dotenv import load_dotenv

load_dotenv()

def test_nvidia():
    try:
        from openai import OpenAI
        client = OpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=os.getenv("NVIDIA_API_KEY"),
        )
        r = client.chat.completions.create(
            model="nvidia/nemotron-3.5-lightning-30b-a3b",
            messages=[{"role": "user", "content": "Say OK"}],
            max_tokens=5,
        )
        print("NVIDIA: ✅ OK -", r.choices[0].message.content)
    except Exception as e:
        print("NVIDIA: ❌", e)

def test_groq():
    try:
        from groq import Groq
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        r = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[{"role": "user", "content": "Say OK"}],
            max_tokens=5,
        )
        print("Groq: ✅ OK -", r.choices[0].message.content)
    except Exception as e:
        print("Groq: ❌", e)

def test_cohere():
    try:
        import cohere
        co = cohere.Client(os.getenv("COHERE_API_KEY"))
        r = co.chat(model="command-a-03-2025", message="Say OK")
        print("Cohere: ✅ OK -", r.text)
    except Exception as e:
        print("Cohere: ❌", e)

def test_gemini():
    try:
        from google import genai
        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        r = client.models.generate_content(
            model="gemini-3.6-flash",
            contents="Say OK",
        )
        print("Gemini: ✅ OK -", r.text)
    except Exception as e:
        print("Gemini: ❌", e)

if __name__ == "__main__":
    test_nvidia()
    test_groq()
    test_cohere()
    test_gemini()