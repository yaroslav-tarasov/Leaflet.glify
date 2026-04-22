#! /usr/bin/bash

echo "Copy dist ..."

cp ~/work/pivp_web_ext/Leaflet.glify/dist/glify-browser.js ~/work/pivp_web/app/static/assets/gl/
cp ~/work/pivp_web_ext/Leaflet.glify/dist/glify-browser.js.map ~/work/pivp_web/app/static/assets/gl/
cp ~/work/pivp_web_ext/Leaflet.glify/dist/glify.js ~/work/pivp_web/app/static/assets/gl/
cp ~/work/pivp_web_ext/Leaflet.glify/dist/glify.js.map ~/work/pivp_web/app/static/assets/gl/

echo "Copy dist done"

