# ai_chatbot.py — Internal support chatbot (NO cost governance)
# This is sample code to test Finault's code scanner

import os
from openai import OpenAI
from anthropic import Anthropic
import google.generativeai as genai

# ⚠️  Hardcoded API keys — scanner should flag these
openai_client = OpenAI(api_key="sk-proj-abc123def456ghi789jkl012mno345pqr678")
anthropic_client = Anthropic(api_key="sk-ant-api03-xYz789AbC012DeF345GhI678JkL901")
genai.configure(api_key="AIzaSyB-example-key-not-real-12345678")

MODELS = {
    "fast": "gpt-4o-mini",
    "smart": "gpt-4o",
    "reasoning": "claude-sonnet-4-5-20250929",
    "creative": "gemini-1.5-pro",
}


def classify_ticket(text: str) -> str:
    """Triage inbound tickets with GPT-4o-mini (cheap + fast)"""
    response = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "Classify the support ticket into: billing, technical, account, other."},
            {"role": "user", "content": text},
        ],
        temperature=0,
    )
    return response.choices[0].message.content.strip()


def draft_response(ticket: str, classification: str) -> str:
    """Draft a customer-facing reply with Claude Sonnet"""
    response = anthropic_client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": f"You are a support agent. The ticket is classified as '{classification}'. Draft a helpful reply:\n\n{ticket}",
            }
        ],
    )
    return response.content[0].text


def weekly_summary(tickets: list[dict]) -> str:
    """Generate executive summary of the week's tickets with GPT-4o"""
    ticket_text = "\n".join(f"- [{t['classification']}] {t['subject']}" for t in tickets)
    response = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "Summarize the support trends. Be concise."},
            {"role": "user", "content": f"This week's {len(tickets)} tickets:\n{ticket_text}"},
        ],
    )
    return response.choices[0].message.content


def generate_kb_article(topic: str) -> str:
    """Use Gemini to draft knowledge base articles"""
    model = genai.GenerativeModel("gemini-1.5-pro")
    response = model.generate_content(
        f"Write a customer-facing knowledge base article about: {topic}"
    )
    return response.text


def embed_for_search(text: str) -> list[float]:
    """Embed text for semantic ticket search"""
    response = openai_client.embeddings.create(
        model="text-embedding-3-large",
        input=text,
    )
    return response.data[0].embedding


def auto_tag_image(image_url: str) -> str:
    """Analyze screenshots attached to tickets"""
    response = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe the issue shown in this screenshot."},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            }
        ],
    )
    return response.choices[0].message.content


# -------- Main pipeline --------
if __name__ == "__main__":
    sample_ticket = "I was charged twice for my Pro subscription last month."

    category = classify_ticket(sample_ticket)
    print(f"Category: {category}")

    reply = draft_response(sample_ticket, category)
    print(f"Draft reply:\n{reply}")

    vector = embed_for_search(sample_ticket)
    print(f"Embedding dims: {len(vector)}")

    article = generate_kb_article("duplicate billing charges")
    print(f"KB article:\n{article}")
