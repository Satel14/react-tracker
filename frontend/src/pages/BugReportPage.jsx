import React from 'react'
import { BugOutlined, MailOutlined, GithubOutlined, SendOutlined } from '@ant-design/icons'
import { Input, Button, message } from 'antd'
import { post } from './../api/fetch'

const { TextArea } = Input

class BugReportPage extends React.Component {
  state = {
    name: '',
    email: '',
    description: '',
    sending: false,
  }

  handleSubmit = async () => {
    const { name, email, description } = this.state

    if (!description.trim()) {
      message.warning('Please describe the bug before submitting.')
      return
    }

    this.setState({ sending: true })

    try {
      await post('/bugreport/send', { name, email, description })
      message.success('Bug report sent successfully! Thank you.')
      this.setState({ name: '', email: '', description: '' })
    } catch (e) {
      message.error('Failed to send bug report. Please try again or contact us directly.')
    } finally {
      this.setState({ sending: false })
    }
  }

  render() {
    const { name, email, description, sending } = this.state
    return (
      <div className='content'>
        <div className='bugreport'>
          <div className='bugreport__header'>
            <BugOutlined className='bugreport__icon' />
            <h1>Bug Report</h1>
            <p>Found something broken? Help us improve by reporting the issue below.</p>
          </div>

          <div className='bugreport__form'>
            <div className='bugreport__field'>
              <label>Your Name <span>(optional)</span></label>
              <Input
                placeholder='Enter your name'
                value={name}
                onChange={(e) => this.setState({ name: e.target.value })}
              />
            </div>

            <div className='bugreport__field'>
              <label>Email <span>(optional, for follow-up)</span></label>
              <Input
                placeholder='your@email.com'
                value={email}
                onChange={(e) => this.setState({ email: e.target.value })}
              />
            </div>

            <div className='bugreport__field'>
              <label>Bug Description <span className='required'>*</span></label>
              <TextArea
                placeholder='Describe the bug: what happened, what you expected, and steps to reproduce...'
                rows={5}
                value={description}
                onChange={(e) => this.setState({ description: e.target.value })}
              />
            </div>

            <Button
              type='primary'
              size='large'
              className='bugreport__submit'
              onClick={this.handleSubmit}
              loading={sending}
              icon={<SendOutlined />}
            >
              {sending ? 'Sending...' : 'Send Bug Report'}
            </Button>
          </div>

          <div className='bugreport__contact'>
            <h2>Other Ways to Report</h2>
            <div className='bugreport__contact-list'>
              <a href='mailto:ostaplvov@gmail.com' className='bugreport__contact-item'>
                <MailOutlined />
                <div>
                  <span className='bugreport__contact-label'>Email</span>
                  <span className='bugreport__contact-value'>ostaplvov@gmail.com</span>
                </div>
              </a>
              <a href='https://github.com/Satel14/react-tracker/issues' target='_blank' rel='noreferrer' className='bugreport__contact-item'>
                <GithubOutlined />
                <div>
                  <span className='bugreport__contact-label'>GitHub Issues</span>
                  <span className='bugreport__contact-value'>Open an issue on GitHub</span>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

export default BugReportPage