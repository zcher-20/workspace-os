#!/usr/bin/env python3
"""
Enterprise Document Agent - MVP
Level 2 (Copilot) / Level 3 (Agent)

Usage:
  python main.py                    Interactive mode
  python main.py --file doc.pdf     Load and summarize a local document
  python main.py --email            Connect to email and process attachments
"""

import argparse
import sys

from rich.console import Console
from rich.panel import Panel

from agent.orchestrator import AgentOrchestrator

console = Console()


def print_banner():
    console.print(Panel(
        "[bold]Enterprise Document Agent[/bold] - MVP v0.1\n"
        "Level 2 Copilot / Level 3 Agent\n\n"
        "Commands:\n"
        "  [cyan]load <filepath>[/cyan]     Load a local document\n"
        "  [cyan]summarize[/cyan]           Summarize the current document\n"
        "  [cyan]ask <question>[/cyan]      Ask a question about the document\n"
        "  [cyan]compare[/cyan]             Compare all loaded documents\n"
        "  [cyan]email connect[/cyan]       Connect to email inbox\n"
        "  [cyan]email list[/cyan]          List recent emails\n"
        "  [cyan]email fetch <uid>[/cyan]   Fetch and process an email\n"
        "  [cyan]docs[/cyan]               List loaded documents\n"
        "  [cyan]help[/cyan]               Show this help\n"
        "  [cyan]quit[/cyan]               Exit",
        title="🤖 Agent",
        border_style="blue",
    ))


def run_interactive(agent: AgentOrchestrator):
    print_banner()

    while True:
        try:
            user_input = console.input("\n[bold green]agent>[/bold green] ").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\nGoodbye.")
            break

        if not user_input:
            continue

        parts = user_input.split(maxsplit=1)
        command = parts[0].lower()
        args_str = parts[1] if len(parts) > 1 else ""

        if command in ("quit", "exit", "q"):
            console.print("Goodbye.")
            break

        elif command == "help":
            print_banner()

        elif command == "load":
            if not args_str:
                console.print("[red]Usage: load <filepath>[/red]")
                continue
            agent.load_local_document(args_str)

        elif command == "summarize":
            agent.summarize(args_str or None)

        elif command == "ask":
            if not args_str:
                console.print("[red]Usage: ask <question>[/red]")
                continue
            agent.ask_question(args_str)

        elif command == "compare":
            agent.compare_documents()

        elif command == "docs":
            if not agent._loaded_docs:
                console.print("No documents loaded.")
            else:
                for name, doc in agent._loaded_docs.items():
                    console.print(f"  📄 {name} ({doc.word_count} words, {doc.page_count} pages)")

        elif command == "email":
            _handle_email_command(agent, args_str)

        else:
            agent.ask_question(user_input)


def _handle_email_command(agent: AgentOrchestrator, args_str: str):
    sub_parts = args_str.split(maxsplit=1)
    sub_cmd = sub_parts[0].lower() if sub_parts else ""
    sub_args = sub_parts[1] if len(sub_parts) > 1 else ""

    if sub_cmd == "connect":
        agent.connect_email()

    elif sub_cmd == "list":
        messages = agent.list_recent_emails()
        if messages:
            for msg in messages:
                has_att = " 📎" if msg.attachments else ""
                console.print(f"  [{msg.uid}] {msg.subject} - {msg.sender}{has_att}")
        else:
            console.print("No emails found.")

    elif sub_cmd == "fetch":
        if not sub_args:
            console.print("[red]Usage: email fetch <uid>[/red]")
            return
        agent.fetch_and_process_email(sub_args)

    elif sub_cmd == "disconnect":
        agent.disconnect_email()

    else:
        console.print("[red]Email commands: connect, list, fetch <uid>, disconnect[/red]")


def run_file_mode(agent: AgentOrchestrator, filepath: str):
    doc = agent.load_local_document(filepath)
    if not doc:
        sys.exit(1)
    agent.summarize()


def run_email_mode(agent: AgentOrchestrator):
    agent.connect_email()
    messages = agent.list_recent_emails(limit=5)

    if not messages:
        console.print("No emails found.")
        agent.disconnect_email()
        return

    console.print("\nRecent emails:")
    for msg in messages:
        console.print(f"  [{msg.uid}] {msg.subject} - {msg.sender}")

    console.print("\nEntering interactive mode to process emails...")
    run_interactive(agent)
    agent.disconnect_email()


def main():
    parser = argparse.ArgumentParser(description="Enterprise Document Agent")
    parser.add_argument("--file", "-f", help="Path to a document to load and summarize")
    parser.add_argument("--email", "-e", action="store_true", help="Connect to email inbox")
    args = parser.parse_args()

    agent = AgentOrchestrator()

    if args.file:
        run_file_mode(agent, args.file)
    elif args.email:
        run_email_mode(agent)
    else:
        run_interactive(agent)


if __name__ == "__main__":
    main()
