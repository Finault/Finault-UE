#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
FINAULT PDF GENERATION SERVICE
═══════════════════════════════════════════════════════════════════════════════

REST API for generating CFO/Auditor-Ready PDFs

Endpoints:
- POST /generate/executive-summary
- POST /generate/journal-entry
- POST /generate/reconciliation-certificate
- POST /generate/controls-narrative
- POST /generate/close-pack (all documents)

All responses return base64-encoded PDFs for easy transport.
═══════════════════════════════════════════════════════════════════════════════
"""

import os
import base64
from flask import Flask, request, jsonify
from flask_cors import CORS
from generator import FinaultPDFGenerator, generate_close_pack_pdfs

app = Flask(__name__)
CORS(app)

# Initialize generator
pdf_generator = FinaultPDFGenerator()


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'service': 'finault-pdf-generator',
        'version': '1.0.0'
    })


@app.route('/generate/executive-summary', methods=['POST'])
def generate_executive_summary():
    """Generate Executive Summary PDF."""
    try:
        data = request.get_json()
        pdf_bytes = pdf_generator.generate_executive_summary(data)

        return jsonify({
            'success': True,
            'document': 'executive_summary.pdf',
            'content': base64.b64encode(pdf_bytes).decode('utf-8'),
            'size': len(pdf_bytes)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/generate/journal-entry', methods=['POST'])
def generate_journal_entry():
    """Generate GL Journal Entry PDF."""
    try:
        data = request.get_json()
        pdf_bytes = pdf_generator.generate_journal_entry(data)

        return jsonify({
            'success': True,
            'document': 'journal_entry.pdf',
            'content': base64.b64encode(pdf_bytes).decode('utf-8'),
            'size': len(pdf_bytes)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/generate/reconciliation-certificate', methods=['POST'])
def generate_reconciliation_certificate():
    """Generate Reconciliation Certificate PDF."""
    try:
        data = request.get_json()
        pdf_bytes = pdf_generator.generate_reconciliation_certificate(data)

        return jsonify({
            'success': True,
            'document': 'reconciliation_certificate.pdf',
            'content': base64.b64encode(pdf_bytes).decode('utf-8'),
            'size': len(pdf_bytes)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/generate/controls-narrative', methods=['POST'])
def generate_controls_narrative():
    """Generate Controls Narrative PDF."""
    try:
        data = request.get_json()
        pdf_bytes = pdf_generator.generate_controls_narrative(data)

        return jsonify({
            'success': True,
            'document': 'controls_narrative.pdf',
            'content': base64.b64encode(pdf_bytes).decode('utf-8'),
            'size': len(pdf_bytes)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/generate/close-pack', methods=['POST'])
def generate_close_pack():
    """
    Generate complete Close Pack - all 4 PDFs.

    Returns all documents in a single response for efficient email attachment.
    """
    try:
        data = request.get_json()
        pdfs = generate_close_pack_pdfs(data)

        documents = []
        for filename, content in pdfs.items():
            documents.append({
                'filename': filename,
                'content': base64.b64encode(content).decode('utf-8'),
                'size': len(content)
            })

        return jsonify({
            'success': True,
            'documents': documents,
            'count': len(documents)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    debug = os.environ.get('DEBUG', 'false').lower() == 'true'

    app.run(host='0.0.0.0', port=port, debug=debug)
