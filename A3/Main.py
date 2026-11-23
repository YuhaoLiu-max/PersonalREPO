# Yuhao Liu - A01787782
import csv
import sys
from collections import deque

import flask
import numpy

app = flask.Flask(__name__)
MARGEN = 2
TIPOS = ["ZZ", "A", "S"]


# Arma el cuarto como en el tablero pero con obstaculos (A = 0). Recibe: M, N,
# pctObstaculos, estaciones, rng | Regresa: A, S, P
def crearCuarto(M, N, pctObstaculos, estaciones, rng):
    A = numpy.ones((M, N))
    libres = [k for k in rng.permutation(M * N) if k not in estaciones]
    for k in libres[:round(pctObstaculos * M * N)]:
        A[numpy.unravel_index(k, A.shape)] = 0
    S = numpy.zeros((A.size, A.size))
    for m in range(M):
        for n in range(N):
            for x in [-1, 0, 1]:
                for y in [-1, 0, 1]:
                    if ((x != 0 or y != 0) and 0 <= m + x < M and 0 <= n + y < N
                            and A[m, n] == 1 and A[m + x, n + y] == 1):
                        S[numpy.ravel_multi_index([m, n], A.shape),
                          numpy.ravel_multi_index([m + x, n + y], A.shape)] = 1
    P = S.copy()
    for i in range(S.shape[0]):
        if numpy.sum(S[i, :]) > 0:
            P[i, :] /= numpy.sum(S[i, :])
    return A, S, P


# BFS sobre S hasta la meta mas cercana. Recibe: S, origen, metas
# Regresa: los pasos a seguir ([] si ya llego) o None si no hay camino
def rutaCorta(S, origen, metas):
    padre = {origen: origen}
    cola = deque([origen])
    encontrado = origen if origen in metas else None
    while cola and encontrado is None:
        actual = cola.popleft()
        for vecino in numpy.where(S[actual, :] != 0)[0]:
            vecino = int(vecino)
            if encontrado is None and vecino not in padre:
                padre[vecino] = actual
                cola.append(vecino)
                encontrado = vecino if vecino in metas else None
    ruta = None
    if encontrado is not None:
        ruta = []
        while encontrado != origen:
            ruta.insert(0, encontrado)
            encontrado = padre[encontrado]
    return ruta


# Checa la ruta como en el tablero (cada paso tiene que estar en S).
# Recibe: S, ruta | Regresa: True o False
def rutaValida(S, ruta):
    return all(a == b or S[a, b] != 0 for a, b in zip(ruta, ruta[1:]))


# Arquitectura de subsuncion: la primera capa que aplica decide. Recibe: agente, S, P,
# sucias, estaciones, rng | Regresa: siguiente estado
def decidir(agente, S, P, sucias, estaciones, rng):
    pos = agente["pos"]
    orden = agente["orden"]
    casa = rutaCorta(S, pos, agente["estaciones"])
    vecinos = [int(v) for v in numpy.where(S[pos, :] != 0)[0]]
    siguiente = pos
    if pos not in sucias:
        agente["basura"].discard(pos)
    # Capa 1: carga hasta llenarse en SU estacion; en otra solo si ya casi no tiene pila
    if pos in estaciones and (agente["cargando"] or agente["bateria"] <= MARGEN
                              or (agente["volviendo"] and pos in agente["estaciones"])):
        agente["cargando"] = agente["bateria"] < 100
        agente["volviendo"] = agente["cargando"]
    if agente["cargando"]:
        siguiente = pos
    # Capa 2: si la pila apenas alcanza para volver, regresa a su estacion
    elif casa and (agente["volviendo"] or agente["bateria"] <= len(casa) + MARGEN):
        agente["volviendo"] = True
        siguiente = casa[0]
    # Capa 3: si esta sucio, limpia (se queda en el mismo estado)
    elif pos in sucias:
        siguiente = pos
    # Capa 4: va a la basura que ya vio
    elif agente["basura"]:
        camino = rutaCorta(S, pos, agente["basura"])
        siguiente = camino[0] if camino else pos
    # Capa 5: explora segun la trayectoria (ZZ zigzag, A aleatoria con P, S exploracion local)
    elif agente["tipo"] == "A" and len(agente["visitadas"]) < len(orden):
        siguiente = int(rng.choice(len(P), p=P[pos, :])) if vecinos else pos
    elif agente["tipo"] in ("ZZ", "S"):
        faltan = [k for k in orden if k not in agente["visitadas"]]
        metas = faltan[:1] if agente["tipo"] == "ZZ" else faltan
        camino = rutaCorta(S, pos, set(metas)) if metas else None
        if camino:
            siguiente = camino[0]
        else:
            agente["visitadas"].update(metas[:1])
    # Capa 6: nada que hacer: regresa a la estacion y espera
    if siguiente == pos and pos not in sucias and casa and not agente["volviendo"]:
        if not agente["basura"] and len(agente["visitadas"]) >= len(orden):
            agente["volviendo"] = True
            siguiente = casa[0]
    return siguiente


# Corre una simulacion. Recibe: M, N, nAgentes, pctSucio, pctObstaculos, tMax, tipo, semilla
# Regresa: A, S, agentes, sucias iniciales, limpiadas, tiempo y las que quedaron
def simular(M, N, nAgentes, pctSucio, pctObstaculos, tMax, tipo, semilla=None):
    rng = numpy.random.default_rng(semilla)
    inicios = [0] if nAgentes == 1 else [int(k) for k in rng.permutation(M * N)[:nAgentes]]
    A, S, P = crearCuarto(M, N, pctObstaculos, inicios, rng)
    libres = [k for k in rng.permutation(M * N) if A.flat[k] == 1 and k not in inicios]
    sucias = set(int(k) for k in libres[:round(pctSucio * len(libres))])
    suciasIniciales = set(sucias)
    limpiadas = {}
    estaciones = set(inicios)
    orden = [numpy.ravel_multi_index([i, j if i % 2 == 0 else N - 1 - j], A.shape)
             for i in range(M) for j in range(N)]
    orden = [int(k) for k in orden if A.flat[k] == 1]
    # todos comparten las visitadas; cada uno empieza el zigzag donde arranca
    visitadas = set(inicios)
    agentes = [{"num": numero + 1, "pos": k, "tipo": tipo, "bateria": 100, "volviendo": False,
                "cargando": False, "estaciones": {k}, "visitadas": visitadas, "basura": set(),
                "ruta": [k], "baterias": [100], "movimientos": 0, "limpiezas": 0,
                "ultimaLimpieza": 0,
                "orden": orden[orden.index(k):] + orden[:orden.index(k)]}
               for numero, k in enumerate(inicios)]
    tiempo = 0
    while sucias and tiempo < tMax:
        tiempo += 1
        for agente in agentes:
            pos = agente["pos"]
            siguiente = decidir(agente, S, P, sucias, estaciones, rng)
            if siguiente != pos:
                agente["movimientos"] += 1
                agente["bateria"] -= 1
            elif pos in sucias:
                sucias.discard(pos)
                limpiadas[pos] = tiempo
                agente["limpiezas"] += 1
                agente["ultimaLimpieza"] = tiempo
                agente["bateria"] -= 1
            elif pos in estaciones:
                agente["bateria"] = min(100, agente["bateria"] + 5)
            agente["pos"] = siguiente
            agente["visitadas"].add(siguiente)
            # percepcion: ve su celda y sus 8 vecinas (la basura)
            alrededor = [siguiente] + [int(v) for v in numpy.where(S[siguiente, :] != 0)[0]]
            agente["basura"] = (agente["basura"] | (set(alrededor) & sucias)) & sucias
            agente["ruta"].append(siguiente)
            agente["baterias"].append(agente["bateria"])
    return A, S, agentes, suciasIniciales, limpiadas, tiempo, sucias


@app.route("/")
def index():
    return flask.render_template("index.html")


# Simula con los parametros de la URL (ej. ?robots=3&tipo=S) y lo manda a la pagina.
# Recibe: nada | Regresa: JSON, o error 400 si un parametro esta mal
@app.route("/api/data")
def data():
    url = flask.request.args
    respuesta = (flask.jsonify({"error": "Parametros no validos"}), 400)
    try:
        M, N, nAgentes = int(url.get("m", 20)), int(url.get("n", 20)), int(url.get("robots", 4))
        pctSucio, pctObstaculos = float(url.get("sucio", 0.3)), float(url.get("obstaculos", 0.1))
        tipo, tMax = url.get("tipo", "ZZ"), int(url.get("tmax", 2000))
        # los porcentajes van de 0 a 1 y el tiempo no puede ser negativo
        if (tipo in TIPOS and 1 <= nAgentes <= M * N and 0 <= pctSucio <= 1
                and 0 <= pctObstaculos < 1 and tMax >= 0):
            A, S, agentes, suciasIniciales, limpiadas, tiempo, quedan = simular(
                M, N, nAgentes, pctSucio, pctObstaculos, tMax, tipo,
                int(url["semilla"]) if "semilla" in url else None)
            estaciones = {agente["ruta"][0] for agente in agentes}
            nodes = {}
            for k in range(A.size):
                i, j = numpy.unravel_index(k, A.shape)
                nodes[k + 1] = {"node": k + 1, "point": (int(j), int(M - i), 0),
                                "dirt": int(k in suciasIniciales), "limpia": limpiadas.get(k),
                                "estacion": k in estaciones, "obstaculo": bool(A.flat[k] == 0)}
            respuesta = flask.jsonify({
                "nodes": nodes, "tiempo": tiempo,
                "routes": {a["num"]: [k + 1 for k in a["ruta"]] for a in agentes},
                "baterias": {a["num"]: a["baterias"] for a in agentes}})
    except ValueError:
        respuesta = (flask.jsonify({"error": "Parametros no validos"}), 400)
    return respuesta


# Corre muchas simulaciones y guarda todo en resultados.csv. Recibe: nada | Regresa: nada
def experimentos():
    with open("resultados.csv", "w", newline="") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(["Agentes", "Tipo", "Semilla", "Tiempo", "PctLimpio", "Agente",
                           "Movimientos", "Limpiezas", "UltimaLimpieza", "BateriaFinal",
                           "RutaValida"])
        for nAgentes in [1, 2, 3, 4, 5, 8]:
            for tipo in TIPOS:
                for semilla in range(20):
                    A, S, agentes, suciasIniciales, limpiadas, tiempo, quedan = simular(
                        10, 10, nAgentes, 0.3, 0.1, 1000, tipo, semilla)
                    libres = int(numpy.sum(A))
                    for a in agentes:
                        escritor.writerow([nAgentes, tipo, semilla, tiempo,
                                           round(100 * (libres - len(quedan)) / libres, 1),
                                           a["num"], a["movimientos"], a["limpiezas"],
                                           a["ultimaLimpieza"], a["bateria"],
                                           rutaValida(S, a["ruta"])])
                print(nAgentes, tipo, "listo")


if __name__ == "__main__":
    if "--experimentos" in sys.argv:
        experimentos()
    else:
        app.run(debug=True)