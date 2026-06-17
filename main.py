import requests
import pandas as pd
import datetime
import time
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
TIMEZONE = pytz.timezone("America/Sao_Paulo")

# Configurações Supabase (REST API)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://mjybzkkwhmxxkhwbpliz.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qeWJ6a2t3aG14eGtod2JwbGl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTIwMzgsImV4cCI6MjA5MDAyODAzOH0.z3jKVgAt08_Vll2z08nAibCFg2Xv6wQflDsJHN84qfM")

def save_to_supabase(estacao_id, nome, status, timestamp):
    url = f"{SUPABASE_URL}/rest/v1/monitoramento"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    payload = {
        "estacao_id": estacao_id,
        "nome": nome,
        "status": status,
        "timestamp": timestamp
    }
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        response.raise_for_status()
    except Exception as e:
        print(f"Erro ao salvar no Supabase REST ({nome}): {e}")

def delete_old_data():
    """Apaga registros com mais de 30 dias do Supabase"""
    url = f"{SUPABASE_URL}/rest/v1/monitoramento"
    limit_date = (datetime.datetime.now(TIMEZONE) - datetime.timedelta(days=30)).isoformat()
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    
    params = {
        "timestamp": f"lt.{limit_date}"
    }
    
    try:
        print(f"Limpando dados anteriores a {limit_date}...")
        response = requests.delete(url, headers=headers, params=params, timeout=15)
        response.raise_for_status()
        print("Limpeza concluída com sucesso.")
    except Exception as e:
        print(f"Erro ao realizar limpeza no Supabase: {e}")

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
                s_name = mapping[s_id]
                status = station.get("stateName", "Unknown")

                data_point = {
                    "ID_Ponto": s_id,
                    "Nome": s_name,
                    "Status": status,
                    "Data": now.strftime("%Y-%m-%d"),
                    "Hora": now.strftime("%H:%M:%S")
                }
                results.append(data_point)
                
                # Salvar no CSV
                file_exists = os.path.isfile(CSV_FILE)
                with open(CSV_FILE, 'a', newline='', encoding='utf-8') as f:
                    if not file_exists and f.tell() == 0:
                        f.write("ID_Ponto,Nome,Status,Data,Hora\n")
                    f.write(f"{s_id},{s_name},{status},{now.strftime('%Y-%m-%d')},{now.strftime('%H:%M:%S')}\n")
                
                # Salvar no Supabase (Real-time via REST)
                save_to_supabase(s_id, s_name, status, now.isoformat())
                    
        return results
    except Exception as e:
        print(f"Erro ao buscar dados: {e}")
        return []

def main():
    print(f"Iniciando checagem {datetime.datetime.now(TIMEZONE)}...")
    results = fetch_all_statuses()
    
    if results:
        print(f"Capturados {len(results)} pontos com sucesso e salvos no Supabase/CSV.")
        # Realizar limpeza periódica (30 dias)
        delete_old_data()
    else:
        print("Não foi possível capturar o status de nenhum ponto.")

if __name__ == "__main__":
    main()
