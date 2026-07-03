ARG BITCOIND_IMAGE=btcpayserver/bitcoin:28.1
FROM ${BITCOIND_IMAGE}

USER root

ARG BITCOIN_SOURCE_VERSION=28.1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates build-essential git libssl-dev python3 \
  && rm -rf /var/lib/apt/lists/*

# Cloned only for Bitcoin Core's contrib/signet/miner; bitcoind itself comes from BITCOIND_IMAGE.
RUN git clone --depth 1 --branch "v${BITCOIN_SOURCE_VERSION}" https://github.com/bitcoin/bitcoin /opt/bitcoin-source

COPY scripts/grind-header-fast.c /usr/local/src/ont-grind-header-fast.c
RUN cc -O3 -pthread -o /usr/local/bin/ont-grind-header-fast /usr/local/src/ont-grind-header-fast.c -lcrypto

COPY docker/private-signet-miner.sh /usr/local/bin/ont-private-signet-miner
RUN chmod 755 /usr/local/bin/ont-private-signet-miner

ENTRYPOINT ["/usr/local/bin/ont-private-signet-miner"]
