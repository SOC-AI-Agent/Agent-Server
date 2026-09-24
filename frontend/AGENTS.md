<!-- BEGIN:nextjs-agent-rules -->


## Overview
โปรเจกต์นี้เป็นโปรเจกต์สำหรับการทำ MCP Client เพื่อไปต่อ MCP Server ต่างๆ แต่เบื้องต้นคือเป็น MCP Client Chat bot

## สิ่งที่ควรรู้
คุณควรดู example file ในแต่ละโฟลเดอร์ เพื่อให้โค้ดไปในทิศทางเดียวกัน และไม่เขียนโค้ดที่ overcook เกินไป เน้นให้อ่านง่าย เขียนต่อง่าย แต่ยังมีประสิทธิภาพ

## Folder Meaning
จะบอกว่าแต่ละโฟลเดอร์ตอนนี้มีไว้ทำไร
### comps
มีไว้เขียน components ต่างๆ โดยแยกหมวดให้เป็นหมวดๆตามฟีเจอร์

#### comps/noti
เป็น noti component สำหรับ alert

#### comps/layouts
เป็นเหมือน layout ที่ครอบทุกอย่างไว้ เป็นภาพใหญ่สุดของ layout ทั้งระบบ

### pages 
หลักๆมีไว้ทำเป็น page router เฉยๆ ดึง component จาก comps อีกที


<!-- END:nextjs-agent-rules -->
