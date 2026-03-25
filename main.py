import requests
import pandas as pd
import datetime
import os
import pytz

# Configurações
STATION_ID = "69173cb53bad44001fc83d83"  # EletroBidu - CCO WEG DC
API_URL = "https://api.tupinambaenergia.com.br/stationsShortVersion?plugTypes=%5B%22Tipo%202%22%2C%22CCS%202%22%2C%22CHAdeMO%22%5D&fast=false&searchText="
CSV_FILE = "historico_tupi.csv"
TIMEZONE = pytz.timezone("America/Sao_Paulo")

def fetch_station_status():
    try:
        response = requests.get(API_URL, timeout=15)
        response.raise_for_status()
        stations = response.json()
        
        # Procura a estação pelo ID
        for station in stations:
            if station.get("_id") == STATION_ID:
                return {
                    "ID_Ponto": STATION_ID,
                    "Nome": station.get("name", "N/A"),
                    "Status": station.get("stateName", "Unknown"),
                    "Data": datetime.datetime.now(TIMEZONE).strftime("%Y-%m-%d"),
                    "Hora": datetime.datetime.now(TIMEZONE).strftime("%H:%M:%S")
                }
        return None
    except Exception as e:
        print(f"Erro ao buscar dados: {e}")
        return None

def save_to_csv(data):
    file_exists = os.path.isfile(CSV_FILE)
    df_new = pd.DataFrame([data])
    
    if not file_exists:
        df_new.to_csv(CSV_FILE, index=False, encoding='utf-8')
    else:
        # Carrega apenas as colunas necessárias para evitar problemas de memória
        df_new.to_csv(CSV_FILE, mode='a', header=False, index=False, encoding='utf-8')

def analyze_last_24h():
    if not os.path.isfile(CSV_FILE):
        return "Nenhum dado histórico encontrado."
    
    df = pd.read_csv(CSV_FILE)
    df['Timestamp'] = pd.to_datetime(df['Data'] + ' ' + df['Hora'])
    
    # Define o limite de 24 horas atrás
    now = datetime.datetime.now()
    limit_24h = now - datetime.timedelta(hours=24)
    
    # Filtra os dados das últimas 24h
    df_recent = df[df['Timestamp'] >= limit_24h]
    
    if df_recent.empty:
        return "Dados insuficientes para as últimas 24h."
    
    total_checks = len(df_recent)
    # Status que indicam ocupação: "Occupied", "In Use", "Charging" (baseado na API da Tupi)
    occupied_statuses = ["Occupied", "Charging", "In Use"]
    busy_checks = len(df_recent[df_recent['Status'].isin(occupied_statuses)])
    
    # Estimativa de tempo (cada check = 5 minutos)
    minutes_busy = busy_checks * 5
    hours = minutes_busy // 60
    minutes = minutes_busy % 60
    
    percentage = (busy_checks / total_checks) * 100
    
    report = (
        f"--- Relatório das últimas 24h ---\n"
        f"Total de medições: {total_checks}\n"
        f"Medições 'Ocupado': {busy_checks}\n"
        f"Tempo total ocupado (est.): {hours}h {minutes}min\n"
        f"Taxa de ocupação: {percentage:.2f}%\n"
        f"--------------------------------"
    )
    return report

def main():
    print(f"Iniciando checagem {datetime.datetime.now(TIMEZONE)}...")
    data = fetch_station_status()
    
    if data:
        print(f"Status capturado: {data['Status']} para {data['Nome']}")
        save_to_csv(data)
        
        # Gera e imprime o relatório diário (será visível no log do GitHub Actions)
        report = analyze_last_24h()
        print(report)
    else:
        print("Não foi possível capturar o status da estação.")

if __name__ == "__main__":
    main()
