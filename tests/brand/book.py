from pathlib import Path
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
pdfmetrics.registerFont(TTFont("GuideSans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("GuideSans-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
r=Path(__file__).resolve().parents[2] / 'assets/brand'
im=Image.open(r/'png/favicon-256.png'); im.save(r/'favicon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
p=r/'UniBOS_Brand_Book_v1.1.pdf'; c=canvas.Canvas(str(p),pagesize=(842,595),initialFontName='GuideSans');c.setTitle('UniBOS Brand Book v1.1');c.setAuthor('UniBOS')
def page(title):
 c.setFillColor(HexColor('#F7F4EC'));c.rect(0,0,842,595,fill=1,stroke=0);c.setFillColor(HexColor('#0F3D32'));c.setFont('GuideSans-Bold',26);c.drawString(45,540,title);c.setFont('GuideSans',11);c.drawString(45,30,'UniBOS | Brand Book v1.1 | Owner-confirmed diagonal identity | 2026-11-15')
def lines(txt,y):
 c.setFillColor(HexColor('#1F2937'));c.setFont('GuideSans',13)
 for line in txt.split('\n'):c.drawString(45,y,line);y-=23
page('One platform. Your entire business.')
c.drawImage(str(r/'png/wordmark-primary-1240.png'),45,265,width=700,height=194,mask='auto')
lines('Unified Business Operating System\nMade in Uzbekistan. Built for the world.\nThe diagonal gold accent and U outline are the authoritative master geometry.\nReplaces the central-bar identity in the supplied v1.0 kit.',220);c.showPage()
page('01 / Logo system')
c.drawImage(str(r/'png/wordmark-light-1240.png'),65,340,width=600,height=166.45,mask='auto')
c.setFillColor(HexColor('#0F3D32'));c.rect(45,145,700,180,fill=1,stroke=0)
c.drawImage(str(r/'png/wordmark-dark-1240.png'),65,150,width=600,height=166.45,mask='auto')
lines('Light background: wordmark-light. Dark background: wordmark-dark.\nLettering is outlined; no external font or network dependency.\nMonochrome: supplied black/white variants. Do not redraw, stretch or rotate.',110);c.showPage()
page('02 / Color system')
for i,(name,h) in enumerate([('Forest Green','#0F3D32'),('Ivory','#F7F4EC'),('Gold Sand','#C9AE78'),('Mint Gray','#D8E3DB'),('Deep Slate','#1F2937')]):
 x=45+i*155;c.setFillColor(HexColor(h));c.rect(x,345,140,140,fill=1,stroke=1);c.setFillColor(HexColor('#1F2937'));c.setFont('GuideSans-Bold',12);c.drawString(x,320,name);c.drawString(x,300,h)
lines('Gold is an accent; do not use it for small text on ivory or white.\nWCAG 2.2 AA is an interface target, not a certification claim.\nOperational semantic colors remain proposals subject to contrast testing.',240);c.showPage()
page('03 / Digital use and typography')
c.drawImage(str(r/'png/app-icon-512.png'),45,300,width=160,height=160,mask='auto')
lines('Use favicon.svg or favicon.ico for browser icons; app-icon for square placement.\n16 px is a technical export; 24 px is the proposed minimum stand-alone mark.\nAt small sizes the full wordmark is not readable: use the mark instead.\nProposed clear space: at least 8 master units; never crop the gold accent.\nInter: UI/body. Playfair Display: premium marketing headings.\nBoth upstream licenses are SIL Open Font License 1.1; retain license notices.\nFuture font builds: self-host WOFF2, subset by supported languages, font-display: swap.\nNo font binaries are shipped; font loading/performance is a P1/P3 gate.\nNo registered-trademark symbol until registration; trademark clearance is pending.',265);c.showPage()
page('04 / Product surfaces and release status')
lines('Modern Luxury: marketing, pricing, guest menu and checkout.\nGlobal Corporate: workspace, POS, kitchen, stock, finance and staff.\nUse truthful demo labels; never invent customers, partners or traction.\nProvide keyboard support, reduced motion and responsive layouts.\nSVG variants derive from the same approved paths and palette.\nBrowser screenshots and technical results: docs/p0-evidence/.\nScreenshots do not replace real-device acceptance or trademark review.\nPublic deployment is not authorized. This package contains no running service.\nSource provenance and usage: assets/brand/README.md.',465);c.save()
print(p)
