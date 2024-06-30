FROM ubuntu:20.04

RUN apt update

RUN apt-get update && \
	apt-get install -yq tzdata && \
	ln -fs /usr/share/zoneinfo/Asia/Tokyo /etc/localtime && \
	dpkg-reconfigure -f noninteractive tzdata

RUN apt install -y make build-essential curl openssh-client git
RUN apt install -y libkpathsea-dev

#### TEXLIVE ###############################################

RUN apt install -y texlive && \
	apt install -y texlive-latex-extra

#### NODEJS ################################################

# needed for installing nvm (see https://stackoverflow.com/a/57344191/1444650)
SHELL ["/bin/bash", "--login", "-c"]

WORKDIR /code

# https://stackoverflow.com/a/57546198/1444650
ENV NODE_VERSION=16.16.0
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash && \
	export NVM_DIR=/root/.nvm && \
	. "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION} && \
	. "$NVM_DIR/nvm.sh" && nvm use v${NODE_VERSION} && \
	. "$NVM_DIR/nvm.sh" && nvm alias default v${NODE_VERSION}
ENV PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"
RUN node --version && \
	npm --version

#### WEB2JS ################################################

# clone web2js and switch to ww-modifications branch, use cd instead
# of WORKDIR here to prevent cache issues when commit hash is updated
# RUN git clone https://github.com/drgrice1/web2js.git && \
RUN git clone https://github.com/thecodechemist99/web2js.git && \
	cd /code/web2js && \
	# git checkout d78ef1f3ec94520c88049b1de36ecf6be2a65c10
	git checkout daa7189ec150c384d0b339aaa04dd8955543aeea

# change directory for all subsequent steps
WORKDIR /code/web2js

# switch to https:// protocol because github deprecated git://
# https://github.com/npm/cli/issues/4896#issuecomment-1128472004
RUN npm install --save https://github.com/kisonecat/node-kpathsea.git
RUN	npm install --save-dev wasm-opt

# generate tex.wasm and core.dump files
RUN npm install --loglevel verbose
RUN npm run build
RUN npm run generate-wasm
RUN ./node_modules/wasm-opt/bin/wasm-opt --asyncify --pass-arg=asyncify-ignore-indirect --pass-arg=asyncify-imports@library.reset -O4 out.wasm -o tex.wasm
RUN node initex.js

# compress tex.wasm and core.dump
RUN gzip tex.wasm && \
	gzip core.dump

#### TIKZJAX ###############################################

WORKDIR /code

# install tikzjax dependencies
RUN apt install -y software-properties-common
RUN add-apt-repository universe && \
	apt update && \
	apt install -y fontforge

# copy local tikzjax source folder
COPY . ./tikzjax

# copy tex.wasm and core.dump to tikzjax folder
RUN cp /code/web2js/tex.wasm.gz /code/tikzjax && \
	cp /code/web2js/core.dump.gz /code/tikzjax

# build tikzjax
WORKDIR /code/tikzjax
RUN npm install
RUN npm run gen-tex-files
RUN npm run build