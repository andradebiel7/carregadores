import requests
import pandas as pd
import datetime
import os
import pytz

# CONFIGURAÇÕES DOS PONTOS DE MONITORAMENTO
STATIONS = [
    {"id": "69173cb53bad44001fc83d83", "name": "EletroBidu - CCO WEG DC"},
    {"id": "66a25ea61060d800227bc0e3", "name": "EletroBidu - CCO MOBY"},
    {"id": "67408530fd34cf001fbd6c63", "name": "EletroBidu - CCO Zeta Uno"},
    {"id": "670eb3214acdfd001f675a13", "name": "EletroBidu - Posto Equipe Shopping"},
    {"id": "6890bcc16899c6001f414dc8", "name": "Posto Quality"}
]

API_URL = "https://api.tupinambaenergia.com.br/stationsShortVersion?plugTypes=%5B%22Tipo%202%22%2C%22CCS%202%22%2C%22CHAdeMO%22%5D&fast=false&searchText="
CSV_FILE = "historico_tupi.csv"
DASHBOARD_FILE = "index.html"
TIMEZONE = pytz.timezone("America/Sao_Paulo")

def fetch_all_statuses():
    try:
        response = requests.get(API_URL, timeout=15)
        response.raise_for_status()
        all_stations = response.json()
        
        results = []
        now = datetime.datetime.now(TIMEZONE)
        
        mapping = {s["id"]: s["name"] for s in STATIONS}
        station_ids = [s["id"] for s in STATIONS]
        
        for station in all_stations:
            s_id = station.get("_id")
            if s_id in station_ids:
                results.append({
                    "ID_Ponto": s_id,
                    "Nome": mapping[s_id],
                    "Status": station.get("stateName", "Unknown"),
                    "Data": now.strftime("%Y-%m-%d"),
                    "Hora": now.strftime("%H:%M:%S")
                })
        return results
    except Exception as e:
        print(f"Erro ao buscar dados: {e}")
        return []

def save_to_csv(data_list):
    if not data_list:
        return
    file_exists = os.path.isfile(CSV_FILE)
    df_new = pd.DataFrame(data_list)
    
    if not file_exists:
        df_new.to_csv(CSV_FILE, index=False, encoding='utf-8')
    else:
        df_new.to_csv(CSV_FILE, mode='a', header=False, index=False, encoding='utf-8')

def get_metrics():
    if not os.path.isfile(CSV_FILE):
        return {}
    
    df = pd.read_csv(CSV_FILE)
    df['Timestamp'] = pd.to_datetime(df['Data'] + ' ' + df['Hora'])
    
    now = datetime.datetime.now()
    limit_24h = now - datetime.timedelta(hours=24)
    df_recent = df[df['Timestamp'] >= limit_24h]
    
    occupied_statuses = ["Occupied", "Charging", "In Use"]
    metrics = {}

    for station in STATIONS:
        s_id = station["id"]
        s_name = station["name"]
        
        df_station = df_recent[df_recent['ID_Ponto'] == s_id]
        
        if df_station.empty:
            metrics[s_id] = {"name": s_name, "status": "Sem dados", "occupancy_24h": 0, "daily_avg": 0}
            continue
            
        total_checks = len(df_station)
        busy_checks = len(df_station[df_station['Status'].isin(occupied_statuses)])
        occupancy = (busy_checks / total_checks) * 100 if total_checks > 0 else 0
        
        # Média diária (baseada em todo o histórico)
        df_all_station = df[df['ID_Ponto'] == s_id]
        total_all = len(df_all_station)
        busy_all = len(df_all_station[df_all_station['Status'].isin(occupied_statuses)])
        daily_avg = (busy_all / total_all) * 100 if total_all > 0 else 0
        
        # Status atual (última linha do CSV para este ID)
        current_status = df_all_station.iloc[-1]['Status'] if not df_all_station.empty else "Unknown"
        
        metrics[s_id] = {
            "name": s_name,
            "status": current_status,
            "occupancy_24h": round(occupancy, 1),
            "daily_avg": round(daily_avg, 1),
            "total_checks": total_checks
        }
        
    return metrics

def generate_dashboard(metrics):
    now_str = datetime.datetime.now(TIMEZONE).strftime("%d/%m/%Y %H:%M:%S")
    
    cards_html = ""
    for s_id, data in metrics.items():
        status_class = "status-available" if data['status'] == "Available" else "status-busy"
        status_text = "Disponível" if data['status'] == "Available" else "Em Uso"
        if data['status'] == "Unknown":
            status_class = "status-unknown"
            status_text = "Desconhecido"

        cards_html += f"""
        <div class="card">
            <div class="card-header">
                <h3>{data['name']}</h3>
                <span class="status-badge {status_class}">{status_text}</span>
            </div>
            <div class="metrics">
                <div class="metric-item">
                    <span class="label">Ocupação (24h)</span>
                    <span class="value">{data['occupancy_24h']}%</span>
                </div>
                <div class="metric-item">
                    <span class="label">Média Diária</span>
                    <span class="value">{data['daily_avg']}%</span>
                </div>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: {data['daily_avg']}%"></div>
            </div>
        </div>
        """

    html_template = f"""
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard Tupi - Real Time</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            :root {{
                --bg-color: #0f172a;
                --card-bg: rgba(30, 41, 59, 0.7);
                --text-primary: #f8fafc;
                --text-secondary: #94a3b8;
                --accent-green: #22c55e;
                --accent-red: #ef4444;
                --accent-blue: #3b82f6;
            }}
            body {{
                font-family: 'Inter', sans-serif;
                background-color: var(--bg-color);
                color: var(--text-primary);
                margin: 0;
                padding: 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
                min-height: 100vh;
            }}
            .header {{
                text-align: center;
                margin-bottom: 40px;
            }}
            .header h1 {{
                font-size: 2.5rem;
                margin-bottom: 10px;
                background: linear-gradient(to right, #60a5fa, #a855f7);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }}
            .header p {{
                color: var(--text-secondary);
                font-size: 1rem;
            }}
            .dashboard-grid {{
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 20px;
                width: 100%;
                max-width: 1200px;
            }}
            .card {{
                background: var(--card-bg);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                padding: 24px;
                transition: transform 0.2s, box-shadow 0.2s;
            }}
            .card:hover {{
                transform: translateY(-5px);
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
            }}
            .card-header {{
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 20px;
            }}
            .card-header h3 {{
                margin: 0;
                font-size: 1.1rem;
                max-width: 70%;
            }}
            .status-badge {{
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 0.75rem;
                font-weight: 700;
                text-transform: uppercase;
            }}
            .status-available {{ background: rgba(34, 197, 94, 0.2); color: var(--accent-green); border: 1px solid var(--accent-green); }}
            .status-busy {{ background: rgba(239, 68, 68, 0.2); color: var(--accent-red); border: 1px solid var(--accent-red); }}
            .status-unknown {{ background: rgba(148, 163, 184, 0.2); color: var(--text-secondary); border: 1px solid var(--text-secondary); }}
            
            .metrics {{
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 15px;
                margin-bottom: 20px;
            }}
            .metric-item {{
                display: flex;
                flex-direction: column;
            }}
            .metric-item .label {{
                font-size: 0.8rem;
                color: var(--text-secondary);
                margin-bottom: 5px;
            }}
            .metric-item .value {{
                font-size: 1.4rem;
                font-weight: 700;
            }}
            .progress-bar-container {{
                background: #334155;
                height: 8px;
                border-radius: 4px;
                overflow: hidden;
            }}
            .progress-bar {{
                background: linear-gradient(to right, #3b82f6, #60a5fa);
                height: 100%;
                border-radius: 4px;
            }}
            .footer {{
                margin-top: 50px;
                color: var(--text-secondary);
                font-size: 0.8rem;
                text-align: center;
            }}
            @media (max-width: 600px) {{
                .dashboard-grid {{
                    grid-template-columns: 1fr;
                }}
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Tupi Real-Time Dashboard</h1>
            <p>Última atualização: {now_str}</p>
        </div>
        
        <div class="dashboard-grid">
            {cards_html}
        </div>
        
        <div class="footer">
            <p>Sistema Autônomo de Monitoramento &copy; 2026</p>
        </div>
    </body>
    </html>
    """
    
    with open(DASHBOARD_FILE, "w", encoding='utf-8') as f:
        f.write(html_template)

def main():
    print(f"Iniciando checagem {datetime.datetime.now(TIMEZONE)}...")
    results = fetch_all_statuses()
    
    if results:
        save_to_csv(results)
        print(f"Capturados {len(results)} pontos com sucesso.")
        
        metrics = get_metrics()
        generate_dashboard(metrics)
        print("Dashboard atualizado com sucesso.")
    else:
        print("Não foi possível capturar o status de nenhum ponto.")

if __name__ == "__main__":
    main()
